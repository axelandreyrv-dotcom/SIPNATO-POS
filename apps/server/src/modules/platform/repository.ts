import type {
  PlatformAuditEntry,
  PlatformSettings,
  SubscriptionPayment,
  SubscriptionPaymentMethod,
} from '@sipnato/shared';
import { controlDb } from '../../db/control.js';

// Todo lo de este módulo vive en control.db: nunca toca la BD de un negocio salvo
// las métricas de uso de `tenantUsage` (service), que se leen dentro de runWithTenant.

export interface Meta {
  ip: string | null;
  userAgent: string | null;
}

// ─── Superadministradores ─────────────────────────────────────────────────────

export interface SuperadminRow {
  id: number;
  username: string;
  password_hash: string;
  active: number;
  failed_attempts: number;
  locked_until: string | null;
  created_at: string;
}

const selectSuperadminByUsername = controlDb.prepare<[string], SuperadminRow>(
  'SELECT * FROM superadmins WHERE username = ?',
);
const selectSuperadminById = controlDb.prepare<[number], SuperadminRow>('SELECT * FROM superadmins WHERE id = ?');

export function findSuperadminByUsername(username: string): SuperadminRow | undefined {
  return selectSuperadminByUsername.get(username);
}

export function findSuperadminById(id: number): SuperadminRow | undefined {
  return selectSuperadminById.get(id);
}

export function listSuperadmins(): SuperadminRow[] {
  return controlDb.prepare<[], SuperadminRow>('SELECT * FROM superadmins ORDER BY username').all();
}

export function insertSuperadmin(username: string, passwordHash: string): void {
  controlDb
    .prepare('INSERT INTO superadmins (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run(username, passwordHash, new Date().toISOString());
}

export function updateSuperadminPassword(id: number, passwordHash: string): void {
  controlDb
    .prepare('UPDATE superadmins SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?')
    .run(passwordHash, id);
}

export function setSuperadminActive(id: number, active: boolean): void {
  controlDb.prepare('UPDATE superadmins SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

export function recordSuperadminFailure(id: number, attempts: number, lockedUntil: string | null): void {
  controlDb.prepare('UPDATE superadmins SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(attempts, lockedUntil, id);
}

export function resetSuperadminFailures(id: number): void {
  controlDb.prepare('UPDATE superadmins SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(id);
}

// ─── Sesiones del panel ───────────────────────────────────────────────────────

export interface PlatformSessionRow {
  id: string;
  superadmin_id: number;
  token_hash: string;
  expires_at: string;
  last_active_at: string;
}

export function insertPlatformSession(row: {
  id: string;
  superadminId: number;
  tokenHash: string;
  expiresAt: string;
  meta: Meta;
}): void {
  const now = new Date().toISOString();
  controlDb
    .prepare(
      `INSERT INTO platform_sessions (id, superadmin_id, token_hash, expires_at, last_active_at, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(row.id, row.superadminId, row.tokenHash, row.expiresAt, now, row.meta.ip, row.meta.userAgent, now);
}

export function findPlatformSession(tokenHash: string): PlatformSessionRow | undefined {
  return controlDb
    .prepare<[string], PlatformSessionRow>('SELECT * FROM platform_sessions WHERE token_hash = ?')
    .get(tokenHash);
}

export function touchPlatformSession(id: string): void {
  controlDb.prepare('UPDATE platform_sessions SET last_active_at = ? WHERE id = ?').run(new Date().toISOString(), id);
}

export function deletePlatformSession(id: string): void {
  controlDb.prepare('DELETE FROM platform_sessions WHERE id = ?').run(id);
}

export function deleteSuperadminSessions(superadminId: number): void {
  controlDb.prepare('DELETE FROM platform_sessions WHERE superadmin_id = ?').run(superadminId);
}

export function deleteExpiredPlatformSessions(inactiveBefore: string): number {
  return controlDb
    .prepare('DELETE FROM platform_sessions WHERE expires_at < ? OR last_active_at < ?')
    .run(new Date().toISOString(), inactiveBefore).changes;
}

// ─── Negocios: datos de cobro ─────────────────────────────────────────────────

const TENANT_FIELD_COLUMNS = {
  name: 'name',
  contactName: 'contact_name',
  contactPhone: 'contact_phone',
  notes: 'notes',
  monthlyPrice: 'monthly_price',
  paidUntil: 'paid_until',
} as const;

export type TenantFields = { [K in keyof typeof TENANT_FIELD_COLUMNS]?: string | number | null | undefined };

export function updateTenantFields(slug: string, fields: TenantFields): void {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined) as [keyof typeof TENANT_FIELD_COLUMNS, unknown][];
  if (entries.length === 0) return;
  // Las columnas salen de la lista fija de arriba, nunca del cliente.
  const sets = entries.map(([k]) => `${TENANT_FIELD_COLUMNS[k]} = ?`).join(', ');
  controlDb.prepare(`UPDATE tenants SET ${sets} WHERE slug = ?`).run(...entries.map(([, v]) => v), slug);
}

export function tenantSlugsWithOwner(): Set<string> {
  // La marca de activación es que el código de un solo uso ya no existe.
  const rows = controlDb
    .prepare<[], { slug: string }>('SELECT slug FROM tenants WHERE setup_code_hash IS NULL')
    .all();
  return new Set(rows.map((r) => r.slug));
}

// ─── Pagos ────────────────────────────────────────────────────────────────────

interface PaymentRow {
  id: number;
  tenant_slug: string;
  amount: number;
  months: number;
  method: SubscriptionPaymentMethod;
  reference: string;
  paid_at: string;
  period_from: string;
  period_to: string;
  previous_paid_until: string | null;
  notes: string;
  voided_at: string | null;
  superadmin_id: number | null;
  recorded_by: string | null;
  created_at: string;
}

export type PaymentRecord = SubscriptionPayment & { previousPaidUntil: string | null };

function toPayment(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    tenantSlug: row.tenant_slug,
    amount: row.amount,
    months: row.months,
    method: row.method,
    reference: row.reference,
    paidAt: row.paid_at,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    previousPaidUntil: row.previous_paid_until,
    notes: row.notes,
    voidedAt: row.voided_at,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
  };
}

const PAYMENT_SELECT = `
  SELECT p.*, s.username AS recorded_by
  FROM subscription_payments p
  LEFT JOIN superadmins s ON s.id = p.superadmin_id`;

export function insertPayment(row: {
  tenantSlug: string;
  amount: number;
  months: number;
  method: SubscriptionPaymentMethod;
  reference: string;
  paidAt: string;
  periodFrom: string;
  periodTo: string;
  previousPaidUntil: string | null;
  notes: string;
  superadminId: number;
}): number {
  const result = controlDb
    .prepare(
      `INSERT INTO subscription_payments
         (tenant_slug, amount, months, method, reference, paid_at, period_from, period_to,
          previous_paid_until, notes, superadmin_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.tenantSlug, row.amount, row.months, row.method, row.reference, row.paidAt, row.periodFrom,
      row.periodTo, row.previousPaidUntil, row.notes, row.superadminId, new Date().toISOString(),
    );
  return Number(result.lastInsertRowid);
}

export function findPayment(slug: string, id: number): PaymentRecord | null {
  const row = controlDb
    .prepare<[string, number], PaymentRow>(`${PAYMENT_SELECT} WHERE p.tenant_slug = ? AND p.id = ?`)
    .get(slug, id);
  return row ? toPayment(row) : null;
}

export function listPayments(slug: string, opts: { includeVoided: boolean; limit: number }): PaymentRecord[] {
  const voided = opts.includeVoided ? '' : 'AND p.voided_at IS NULL';
  return controlDb
    .prepare<[string, number], PaymentRow>(`${PAYMENT_SELECT} WHERE p.tenant_slug = ? ${voided} ORDER BY p.id DESC LIMIT ?`)
    .all(slug, opts.limit)
    .map(toPayment);
}

export function latestActivePaymentId(slug: string): number | null {
  const row = controlDb
    .prepare<[string], { id: number }>(
      'SELECT id FROM subscription_payments WHERE tenant_slug = ? AND voided_at IS NULL ORDER BY id DESC LIMIT 1',
    )
    .get(slug);
  return row?.id ?? null;
}

export function markPaymentVoided(id: number): void {
  controlDb.prepare('UPDATE subscription_payments SET voided_at = ? WHERE id = ?').run(new Date().toISOString(), id);
}

// paid_at es una fecha (YYYY-MM-DD) del calendario de CR: se compara como texto.
export function sumPaymentsBetween(from: string, to: string): number {
  const row = controlDb
    .prepare<[string, string], { total: number }>(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM subscription_payments WHERE voided_at IS NULL AND paid_at BETWEEN ? AND ?',
    )
    .get(from, to);
  return row?.total ?? 0;
}

// ─── Configuración de la plataforma ───────────────────────────────────────────

const PLATFORM_SETTING_KEYS = {
  defaultMonthlyPrice: 'default_monthly_price',
  paymentInstructions: 'payment_instructions',
  reminderMessage: 'reminder_message',
} as const satisfies Record<keyof PlatformSettings, string>;

export function readPlatformSettings(): Partial<Record<keyof PlatformSettings, string>> {
  const rows = controlDb.prepare<[], { key: string; value: string }>('SELECT key, value FROM platform_settings').all();
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out: Partial<Record<keyof PlatformSettings, string>> = {};
  for (const [field, key] of Object.entries(PLATFORM_SETTING_KEYS) as [keyof PlatformSettings, string][]) {
    const value = byKey.get(key);
    if (value !== undefined) out[field] = value;
  }
  return out;
}

export function writePlatformSettings(settings: PlatformSettings): void {
  const upsert = controlDb.prepare(
    'INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  for (const [field, key] of Object.entries(PLATFORM_SETTING_KEYS) as [keyof PlatformSettings, string][]) {
    upsert.run(key, String(settings[field]));
  }
}

// ─── Bitácora ─────────────────────────────────────────────────────────────────

export function insertPlatformAudit(entry: {
  action: string;
  tenantSlug?: string | null;
  payload?: Record<string, unknown>;
  superadminId: number | null;
  meta: Meta;
}): void {
  controlDb
    .prepare(
      `INSERT INTO platform_audit_log (action, tenant_slug, payload, superadmin_id, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.action,
      entry.tenantSlug ?? null,
      entry.payload ? JSON.stringify(entry.payload) : null,
      entry.superadminId,
      entry.meta.ip,
      entry.meta.userAgent,
      new Date().toISOString(),
    );
}

export function listPlatformAudit(slug: string, limit: number): PlatformAuditEntry[] {
  return controlDb
    .prepare<[string, number], { id: number; action: string; payload: string | null; username: string | null; created_at: string }>(
      `SELECT a.id, a.action, a.payload, s.username, a.created_at
       FROM platform_audit_log a LEFT JOIN superadmins s ON s.id = a.superadmin_id
       WHERE a.tenant_slug = ? ORDER BY a.id DESC LIMIT ?`,
    )
    .all(slug, limit)
    .map((r) => ({
      id: r.id,
      action: r.action,
      payload: r.payload ? (JSON.parse(r.payload) as Record<string, unknown>) : null,
      superadmin: r.username,
      createdAt: r.created_at,
    }));
}

// Varias escrituras en control.db que deben ocurrir juntas (p. ej. pago + vencimiento + bitácora).
export function controlTransaction<T>(fn: () => T): T {
  return controlDb.transaction(fn)();
}
