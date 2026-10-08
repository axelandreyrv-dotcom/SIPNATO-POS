import Database from 'better-sqlite3';
import { isValidSlug } from '@sipnato/shared';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';

// control.db es el registro de negocios y de la plataforma (suscripciones, superadministradores,
// tipo de cambio). NUNCA guarda datos operativos de un negocio (ventas, clientes, sesiones de sus
// usuarios): esos viven exclusivamente en tenants/<slug>.db.

export type TenantStatus = 'active' | 'suspended';

export interface TenantRecord {
  slug: string;
  name: string;
  status: TenantStatus;
  createdAt: string;
  contactName: string;
  contactPhone: string;
  notes: string;
  monthlyPrice: number | null;
  paidUntil: string | null;
}

// El regex del slug también es la barrera contra path traversal: termina en un nombre de archivo.
export { isValidSlug };

mkdirSync(config.DATA_DIR, { recursive: true });

export const controlDb = new Database(join(config.DATA_DIR, 'control.db'));
controlDb.pragma('journal_mode = WAL');
controlDb.pragma('busy_timeout = 5000');
controlDb.pragma('foreign_keys = ON');

// setup_code_hash: código de activación de un solo uso que exige /auth/setup. Sin él,
// quien llegara primero al subdominio de un negocio nuevo podría reclamar su cuenta admin.
controlDb.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    slug            TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    created_at      TEXT NOT NULL,
    setup_code_hash TEXT
  )
`);

// Tipo de cambio del BCCR: es el mismo para todos los negocios, por eso vive aquí y no en
// la BD de cada negocio. buy/sell en centésimas de colón (₡505.23 = 50523).
controlDb.exec(`
  CREATE TABLE IF NOT EXISTS exchange_rates (
    date       TEXT PRIMARY KEY,
    buy        INTEGER NOT NULL,
    sell       INTEGER NOT NULL,
    fetched_at TEXT NOT NULL
  )
`);

// control.db creadas antes de existir cada columna.
// Suscripción (Fase F): paid_until es el último día cubierto (YYYY-MM-DD, hora de CR), NULL = sin
// cobro; monthly_price NULL = precio por defecto de la plataforma.
const TENANT_COLUMNS: [string, string][] = [
  ['setup_code_hash', 'TEXT'],
  ['contact_name', "TEXT NOT NULL DEFAULT ''"],
  ['contact_phone', "TEXT NOT NULL DEFAULT ''"],
  ['notes', "TEXT NOT NULL DEFAULT ''"],
  ['monthly_price', 'INTEGER'],
  ['paid_until', 'TEXT'],
];
const tenantColumns = controlDb
  .prepare<[], { name: string }>("SELECT name FROM pragma_table_info('tenants')")
  .all();
for (const [name, type] of TENANT_COLUMNS) {
  if (!tenantColumns.some((c) => c.name === name))
    controlDb.exec(`ALTER TABLE tenants ADD COLUMN ${name} ${type}`);
}

// ─── Plataforma (Fase F) ──────────────────────────────────────────────────────
// Superadministradores: se crean solo por consola (scripts/superadmin.ts). Sus sesiones son
// independientes de las de cualquier negocio y solo valen en el subdominio del panel.
controlDb.exec(`
  CREATE TABLE IF NOT EXISTS superadmins (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    active          INTEGER NOT NULL DEFAULT 1,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TEXT,
    created_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS platform_sessions (
    id             TEXT PRIMARY KEY,
    superadmin_id  INTEGER NOT NULL REFERENCES superadmins(id),
    token_hash     TEXT NOT NULL UNIQUE,
    expires_at     TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    ip             TEXT,
    user_agent     TEXT,
    created_at     TEXT NOT NULL
  );

  -- Pagos de la mensualidad registrados a mano. No se borran: un error se anula (voided_at).
  -- previous_paid_until permite devolver el vencimiento al anular el último pago.
  CREATE TABLE IF NOT EXISTS subscription_payments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_slug         TEXT NOT NULL REFERENCES tenants(slug),
    amount              INTEGER NOT NULL CHECK (amount >= 0),
    months              INTEGER NOT NULL CHECK (months > 0),
    method              TEXT NOT NULL,
    reference           TEXT NOT NULL DEFAULT '',
    paid_at             TEXT NOT NULL,
    period_from         TEXT NOT NULL,
    period_to           TEXT NOT NULL,
    previous_paid_until TEXT,
    notes               TEXT NOT NULL DEFAULT '',
    voided_at           TEXT,
    superadmin_id       INTEGER REFERENCES superadmins(id),
    created_at          TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS subscription_payments_tenant ON subscription_payments (tenant_slug, id);

  CREATE TABLE IF NOT EXISTS platform_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Solo inserción, igual que el audit_log de cada negocio.
  CREATE TABLE IF NOT EXISTS platform_audit_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    action        TEXT NOT NULL,
    tenant_slug   TEXT,
    payload       TEXT,
    superadmin_id INTEGER,
    ip            TEXT,
    user_agent    TEXT,
    created_at    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS platform_audit_log_tenant ON platform_audit_log (tenant_slug, id);
`);

interface TenantRow {
  slug: string;
  name: string;
  status: TenantStatus;
  created_at: string;
  setup_code_hash: string | null;
  contact_name: string;
  contact_phone: string;
  notes: string;
  monthly_price: number | null;
  paid_until: string | null;
}

function toRecord(row: TenantRow): TenantRecord {
  return {
    slug: row.slug,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    notes: row.notes,
    monthlyPrice: row.monthly_price,
    paidUntil: row.paid_until,
  };
}

const selectOne = controlDb.prepare<[string], TenantRow>('SELECT * FROM tenants WHERE slug = ?');
const selectAll = controlDb.prepare<[], TenantRow>('SELECT * FROM tenants ORDER BY slug');
const selectActive = controlDb.prepare<[], TenantRow>(
  "SELECT * FROM tenants WHERE status = 'active' ORDER BY slug",
);
const insertOne = controlDb.prepare<[string, string, string]>(
  'INSERT INTO tenants (slug, name, created_at) VALUES (?, ?, ?)',
);
const updateStatus = controlDb.prepare<[TenantStatus, string]>(
  'UPDATE tenants SET status = ? WHERE slug = ?',
);
const updateSetupCode = controlDb.prepare<[string | null, string]>(
  'UPDATE tenants SET setup_code_hash = ? WHERE slug = ?',
);

export function findTenant(slug: string): TenantRecord | null {
  if (!isValidSlug(slug)) return null;
  const row = selectOne.get(slug);
  return row ? toRecord(row) : null;
}

export function listTenants(): TenantRecord[] {
  return selectAll.all().map(toRecord);
}

export function listActiveTenants(): TenantRecord[] {
  return selectActive.all().map(toRecord);
}

export function insertTenant(slug: string, name: string): TenantRecord {
  if (!isValidSlug(slug)) throw new Error(`Slug inválido o reservado: "${slug}"`);
  insertOne.run(slug, name, new Date().toISOString());
  return findTenant(slug)!;
}

export function setTenantStatus(slug: string, status: TenantStatus): boolean {
  return updateStatus.run(status, slug).changes > 0;
}

export function getSetupCodeHash(slug: string): string | null {
  return selectOne.get(slug)?.setup_code_hash ?? null;
}

// null invalida el código (se usó o se reemplaza).
export function setSetupCodeHash(slug: string, hash: string | null): boolean {
  return updateSetupCode.run(hash, slug).changes > 0;
}

// ─── Tipo de cambio ───────────────────────────────────────────────────────────

export interface ExchangeRateRow {
  date: string;
  buy: number;
  sell: number;
  fetchedAt: string;
}

const upsertRate = controlDb.prepare<[string, number, number, string]>(`
  INSERT INTO exchange_rates (date, buy, sell, fetched_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(date) DO UPDATE SET buy = excluded.buy, sell = excluded.sell, fetched_at = excluded.fetched_at
`);
const selectLatestRate = controlDb.prepare<
  [],
  { date: string; buy: number; sell: number; fetched_at: string }
>('SELECT * FROM exchange_rates ORDER BY date DESC LIMIT 1');

export function saveExchangeRate(date: string, buy: number, sell: number): void {
  upsertRate.run(date, buy, sell, new Date().toISOString());
}

export function latestExchangeRate(): ExchangeRateRow | null {
  const row = selectLatestRate.get();
  return row ? { date: row.date, buy: row.buy, sell: row.sell, fetchedAt: row.fetched_at } : null;
}

export function pingControlDb(): void {
  controlDb.prepare('SELECT 1').get();
}

export function closeControlDb(): void {
  controlDb.close();
}
