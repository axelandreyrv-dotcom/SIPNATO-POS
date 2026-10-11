import { AsyncLocalStorage } from 'node:async_hooks';
import { isValidSlug } from '@sipnato/shared';

// control.db es el registro de negocios y de la plataforma (suscripciones, superadministradores,
// tipo de cambio). Vive en el SQLite del Durable Object de la plataforma. NUNCA guarda datos
// operativos de un negocio (ventas, clientes, sesiones de sus usuarios): esos viven solo en el
// Durable Object de cada negocio.

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

export { isValidSlug };

// ─── Acceso a la BD de la plataforma ──────────────────────────────────────────

const platformStorage = new AsyncLocalStorage<DurableObjectStorage>();

export function runInPlatform<T>(storage: DurableObjectStorage, fn: () => T): T {
  return platformStorage.run(storage, fn);
}

// Falla cerrado: el código de un negocio corre en el mismo isolate pero nunca dentro de
// runInPlatform, así que no puede leer ni escribir las tablas de la plataforma.
export function currentPlatformStorage(): DurableObjectStorage {
  const storage = platformStorage.getStore();
  if (!storage) throw new Error('control.db usado fuera de la plataforma');
  return storage;
}

export interface Statement<P extends unknown[], R> {
  get(...params: P): R | undefined;
  all(...params: P): R[];
  run(...params: P): { changes: number; lastInsertRowid: number };
}

function exec<R>(sql: string, params: unknown[]): R[] {
  return currentPlatformStorage()
    .sql.exec(sql, ...(params as SqlStorageValue[]))
    .toArray() as R[];
}

// Imita la API de better-sqlite3 que usaba el repositorio: las sentencias se pueden declarar a
// nivel de módulo porque el storage se resuelve en cada llamada, no al preparar.
export const controlDb = {
  prepare<P extends unknown[] = unknown[], R = unknown>(sql: string): Statement<P, R> {
    return {
      get: (...params) => exec<R>(sql, params)[0],
      all: (...params) => exec<R>(sql, params),
      run: (...params) => {
        const sqlStorage = currentPlatformStorage().sql;
        sqlStorage.exec(sql, ...(params as SqlStorageValue[])).toArray();
        // changes() y no rowsWritten: este último cuenta también las filas de los índices.
        const row = sqlStorage
          .exec<{
            changes: number;
            id: number;
          }>('SELECT changes() AS changes, last_insert_rowid() AS id')
          .one();
        return { changes: row.changes, lastInsertRowid: row.id };
      },
    };
  },
  exec(sql: string): void {
    currentPlatformStorage().sql.exec(sql);
  },
};

// Varias escrituras que deben ocurrir juntas (p. ej. pago + vencimiento + bitácora).
export function controlTransaction<T>(fn: () => T): T {
  return currentPlatformStorage().transactionSync(fn);
}

// ─── Esquema ──────────────────────────────────────────────────────────────────

// Lo llama el constructor de PlatformDO, dentro de runInPlatform. Idempotente.
export function initControlSchema(): void {
  // setup_code_hash: código de activación de un solo uso que exige /auth/setup. Sin él,
  // quien llegara primero al subdominio de un negocio nuevo podría reclamar su cuenta.
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

  // Suscripción (Fase F): paid_until es el último día cubierto (YYYY-MM-DD, hora de CR), NULL =
  // sin cobro; monthly_price NULL = precio por defecto de la plataforma.
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

  // Superadministradores: no hay alta por HTTP. Sus sesiones son independientes de las de
  // cualquier negocio y solo valen en el subdominio del panel.
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
}

// ─── Negocios ─────────────────────────────────────────────────────────────────

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
const deletePayments = controlDb.prepare<[string]>(
  'DELETE FROM subscription_payments WHERE tenant_slug = ?',
);
const deleteOne = controlDb.prepare<[string]>('DELETE FROM tenants WHERE slug = ?');
const insertOne = controlDb.prepare<[string, string, string]>(
  'INSERT INTO tenants (slug, name, created_at) VALUES (?, ?, ?)',
);
const updateStatus = controlDb.prepare<[TenantStatus, string]>(
  'UPDATE tenants SET status = ? WHERE slug = ?',
);
const updateSetupCode = controlDb.prepare<[string | null, string]>(
  'UPDATE tenants SET setup_code_hash = ? WHERE slug = ?',
);
const clearSetupCode = controlDb.prepare<[string, string]>(
  'UPDATE tenants SET setup_code_hash = NULL WHERE slug = ? AND setup_code_hash = ?',
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

// El registro del negocio y sus pagos (los referencian), para que el subdominio se pueda reusar.
// La bitácora de la plataforma no se toca: es solo inserción. Va dentro de controlTransaction.
export function deleteTenantRecord(slug: string): boolean {
  deletePayments.run(slug);
  return deleteOne.run(slug).changes > 0;
}

export function setTenantStatus(slug: string, status: TenantStatus): boolean {
  return updateStatus.run(status, slug).changes > 0;
}

export function getSetupCodeHash(slug: string): string | null {
  if (!isValidSlug(slug)) return null;
  return selectOne.get(slug)?.setup_code_hash ?? null;
}

// null invalida el código (se usó o se reemplaza).
export function setSetupCodeHash(slug: string, hash: string | null): boolean {
  return updateSetupCode.run(hash, slug).changes > 0;
}

// Gasta el código solo si sigue siendo el que se verificó: entre la verificación (async) y este
// UPDATE otro setup pudo gastarlo o el panel pudo emitir otro. true = este llamador lo gastó.
export function consumeSetupCodeHash(slug: string, verifiedHash: string): boolean {
  return clearSetupCode.run(slug, verifiedHash).changes === 1;
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
