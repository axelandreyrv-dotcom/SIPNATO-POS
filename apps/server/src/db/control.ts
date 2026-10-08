import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';

// control.db es el registro de negocios. NUNCA guarda datos operativos de un negocio
// (ventas, clientes, sesiones): esos viven exclusivamente en tenants/<slug>.db.

export type TenantStatus = 'active' | 'suspended';

export interface TenantRecord {
  slug: string;
  name: string;
  status: TenantStatus;
  createdAt: string;
}

// Un label DNS: minúsculas, dígitos y guiones, sin guion al inicio/final, máx. 32 chars.
// Este regex también es la barrera contra path traversal: el slug termina en un nombre de archivo.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

// Subdominios que nunca pueden ser un negocio.
const RESERVED_SLUGS = new Set(['www', 'api', 'app', 'admin', 'mail', 'static', 'assets', 'control']);

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}

mkdirSync(config.DATA_DIR, { recursive: true });

const controlDb = new Database(join(config.DATA_DIR, 'control.db'));
controlDb.pragma('journal_mode = WAL');
controlDb.pragma('busy_timeout = 5000');

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

// control.db creadas antes de existir la columna.
const tenantColumns = controlDb.prepare<[], { name: string }>("SELECT name FROM pragma_table_info('tenants')").all();
if (!tenantColumns.some((c) => c.name === 'setup_code_hash')) {
  controlDb.exec('ALTER TABLE tenants ADD COLUMN setup_code_hash TEXT');
}

interface TenantRow {
  slug: string;
  name: string;
  status: TenantStatus;
  created_at: string;
  setup_code_hash: string | null;
}

function toRecord(row: TenantRow): TenantRecord {
  return { slug: row.slug, name: row.name, status: row.status, createdAt: row.created_at };
}

const selectOne = controlDb.prepare<[string], TenantRow>('SELECT * FROM tenants WHERE slug = ?');
const selectAll = controlDb.prepare<[], TenantRow>('SELECT * FROM tenants ORDER BY slug');
const selectActive = controlDb.prepare<[], TenantRow>("SELECT * FROM tenants WHERE status = 'active' ORDER BY slug");
const insertOne = controlDb.prepare<[string, string, string]>(
  'INSERT INTO tenants (slug, name, created_at) VALUES (?, ?, ?)',
);
const updateStatus = controlDb.prepare<[TenantStatus, string]>('UPDATE tenants SET status = ? WHERE slug = ?');
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

export function pingControlDb(): void {
  controlDb.prepare('SELECT 1').get();
}

export function closeControlDb(): void {
  controlDb.close();
}
