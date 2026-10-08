import { AsyncLocalStorage } from 'async_hooks';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { isValidSlug } from './control.js';
import * as schema from './schema.js';
import { counters, settings } from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = join(__dirname, 'migrations');

export type TenantDb = BetterSQLite3Database<typeof schema>;

export interface TenantContext {
  slug: string;
  db: TenantDb;
  sqlite: Database.Database;
}

// ── Rutas por negocio ─────────────────────────────────────────────────────────
// El slug ya pasó por isValidSlug (regex de label DNS), así que nunca contiene "/" ni "..".

function assertSlug(slug: string): void {
  if (!isValidSlug(slug)) throw new Error(`Slug de negocio inválido: "${slug}"`);
}

export function tenantDbPath(slug: string): string {
  assertSlug(slug);
  return join(config.DATA_DIR, 'tenants', `${slug}.db`);
}

export function tenantBackupDir(slug: string): string {
  assertSlug(slug);
  return join(config.DATA_DIR, 'backups', slug);
}

// ── Apertura + caché de conexiones ────────────────────────────────────────────

const openTenants = new Map<string, TenantContext>();

// Inserta datos estructurales mínimos que deben existir en cualquier negocio.
// Idempotente — onConflictDoNothing garantiza que no rompe si ya existen.
function bootstrapTenantDb(db: TenantDb): void {
  db.insert(counters).values([
    { type: 'sale', currentValue: 0 },
    { type: 'boleta', currentValue: 0 },
    { type: 'quote', currentValue: 0 },
    { type: 'apartado', currentValue: 0 },
    { type: 'factura', currentValue: 0 },
    { type: 'credito', currentValue: 0 },
  ]).onConflictDoNothing().run();

  db.insert(settings).values([
    { key: 'shop_name', value: '' },
    { key: 'shop_phone', value: '' },
    { key: 'shop_id_number', value: '' },
    { key: 'receipt_footer', value: '' },
    { key: 'boleta_footer', value: '' },
    { key: 'quote_footer', value: '' },
    { key: 'auto_close_enabled', value: 'false' },
    { key: 'auto_close_time', value: '00:00' },
  ]).onConflictDoNothing().run();
}

// Abre (o reutiliza) la BD de un negocio. La primera apertura aplica migraciones
// pendientes y el bootstrap, así cada negocio se actualiza solo al usarse.
export function openTenantDb(slug: string): TenantContext {
  const cached = openTenants.get(slug);
  if (cached) return cached;

  const path = tenantDbPath(slug);
  mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  const db = drizzle(sqlite, { schema });
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    bootstrapTenantDb(db);
  } catch (err) {
    sqlite.close();
    throw err;
  }

  const ctx: TenantContext = { slug, db, sqlite };
  openTenants.set(slug, ctx);
  return ctx;
}

export function closeAllTenantDbs(): void {
  for (const ctx of openTenants.values()) ctx.sqlite.close();
  openTenants.clear();
}

// ── Contexto del request/job actual ───────────────────────────────────────────

export type UserRole = (typeof schema.USER_ROLES)[number];

export interface Actor {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
}

// Un objeto nuevo por request/job: el TenantContext cacheado se comparte entre requests,
// así que el actor no puede vivir en él.
interface RequestContext extends TenantContext {
  actor: Actor | null;
}

const tenantStorage = new AsyncLocalStorage<RequestContext>();

export function runWithTenant<T>(slug: string, fn: () => T): T {
  return tenantStorage.run({ ...openTenantDb(slug), actor: null }, fn);
}

export function enterTenantContext(ctx: TenantContext, fn: () => void): void {
  tenantStorage.run({ ...ctx, actor: null }, fn);
}

// Falla cerrado: cualquier acceso a datos fuera de un negocio identificado lanza,
// en vez de caer silenciosamente en una BD por defecto.
export function currentTenant(): RequestContext {
  const ctx = tenantStorage.getStore();
  if (!ctx) throw new Error('Acceso a BD sin negocio en contexto');
  return ctx;
}

// Lo fija requireAuth tras validar la sesión.
export function setActor(actor: Actor): void {
  currentTenant().actor = actor;
}

// Autor que se registra en audit_log. null = sistema (cron, scripts) o request sin sesión.
export function currentActorId(): number | null {
  return tenantStorage.getStore()?.actor?.id ?? null;
}

// `db` es un proxy hacia la BD del negocio del request/job actual. Los repositories
// siguen importando `db` igual que antes; el aislamiento lo garantiza el contexto.
export const db = new Proxy({} as TenantDb, {
  get(_target, prop) {
    const real = currentTenant().db;
    const value = Reflect.get(real, prop, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
