import { randomUUID } from 'crypto';
import { count, desc, isNull } from 'drizzle-orm';
import {
  addMonths,
  DEFAULT_REMINDER_MESSAGE,
  subscriptionStatus,
  type CreateTenantInput,
  type PlatformSettings,
  type PlatformSummary,
  type PlatformTenant,
  type PlatformTenantDetail,
  type RecordPaymentInput,
  type SubscriptionInfo,
  type Superadmin,
  type UpdateTenantInput,
} from '@sipnato/shared';
import { db, openTenantDb, runWithTenant } from '../../db/client.js';
import {
  findTenant,
  insertTenant,
  listTenants,
  setSetupCodeHash,
  setTenantStatus,
  type TenantRecord,
  type TenantStatus,
} from '../../db/control.js';
import { sales, users } from '../../db/schema.js';
import { todayCR } from '../../lib/cr-time.js';
import {
  DUMMY_HASH,
  generateSessionToken,
  generateSetupCode,
  hashPassword,
  hashSessionToken,
  hashSetupCode,
  verifyPassword,
} from '../../lib/crypto.js';
import {
  CredencialesInvalidas,
  NegocioNoEncontrado,
  NegocioYaActivado,
  NegocioYaExiste,
  PagoNoEncontrado,
  PagoYaAnulado,
  UsuarioBloqueado,
} from '../../lib/errors.js';
import { INACTIVITY_TIMEOUT_MS, SESSION_DURATION_MS } from '../../lib/session.js';
import {
  controlTransaction,
  deletePlatformSession,
  deleteSuperadminSessions,
  findPayment,
  findPlatformSession,
  findSuperadminById,
  findSuperadminByUsername,
  insertPayment,
  insertPlatformAudit,
  insertPlatformSession,
  latestActivePaymentId,
  listPayments,
  listPlatformAudit,
  markPaymentVoided,
  readPlatformSettings,
  recordSuperadminFailure,
  resetSuperadminFailures,
  sumPaymentsBetween,
  touchPlatformSession,
  updateSuperadminPassword,
  updateTenantFields,
  writePlatformSettings,
  type Meta,
  type PaymentRecord,
} from './repository.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

// ─── Sesión del superadministrador ────────────────────────────────────────────

async function verifySuperadminCredentials(username: string, password: string) {
  const admin = findSuperadminByUsername(username);
  if (admin?.locked_until && new Date(admin.locked_until).getTime() > Date.now()) throw new UsuarioBloqueado();

  const valid = await verifyPassword(password, admin?.password_hash ?? DUMMY_HASH);
  if (!admin || !admin.active || !valid) {
    if (admin && admin.active && !valid) {
      const attempts = admin.failed_attempts + 1;
      const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_DURATION_MS).toISOString() : null;
      recordSuperadminFailure(admin.id, lockedUntil ? 0 : attempts, lockedUntil);
      if (lockedUntil) throw new UsuarioBloqueado();
    }
    throw new CredencialesInvalidas();
  }
  if (admin.failed_attempts > 0 || admin.locked_until) resetSuperadminFailures(admin.id);
  return admin;
}

function openSession(superadminId: number, meta: Meta): string {
  const token = generateSessionToken();
  insertPlatformSession({
    id: randomUUID(),
    superadminId,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
    meta,
  });
  return token;
}

export async function loginSuperadmin(username: string, password: string, meta: Meta): Promise<string> {
  let admin;
  try {
    admin = await verifySuperadminCredentials(username, password);
  } catch (err) {
    insertPlatformAudit({ action: 'PLATFORM_LOGIN_FAILED', payload: { username }, superadminId: null, meta });
    throw err;
  }
  insertPlatformAudit({ action: 'PLATFORM_LOGIN', superadminId: admin.id, meta });
  return openSession(admin.id, meta);
}

export function verifyPlatformSession(token: string): { sessionId: string; admin: Superadmin } | null {
  const session = findPlatformSession(hashSessionToken(token));
  if (!session) return null;

  const now = Date.now();
  const expired =
    new Date(session.expires_at).getTime() < now ||
    new Date(session.last_active_at).getTime() + INACTIVITY_TIMEOUT_MS < now;
  const admin = findSuperadminById(session.superadmin_id);

  if (expired || !admin?.active) {
    deletePlatformSession(session.id);
    return null;
  }
  touchPlatformSession(session.id);
  return { sessionId: session.id, admin: { id: admin.id, username: admin.username } };
}

export function logoutSuperadmin(sessionId: string, admin: Superadmin, meta: Meta): void {
  deletePlatformSession(sessionId);
  insertPlatformAudit({ action: 'PLATFORM_LOGOUT', superadminId: admin.id, meta });
}

// Cierra todas las sesiones del superadministrador (CLAUDE.md §6.1) y abre una nueva para quien cambió la clave.
export async function changeSuperadminPassword(
  admin: Superadmin,
  currentPassword: string,
  newPassword: string,
  meta: Meta,
): Promise<string> {
  await verifySuperadminCredentials(admin.username, currentPassword);
  updateSuperadminPassword(admin.id, await hashPassword(newPassword));
  deleteSuperadminSessions(admin.id);
  insertPlatformAudit({ action: 'PLATFORM_PASSWORD_CHANGED', superadminId: admin.id, meta });
  return openSession(admin.id, meta);
}

// ─── Configuración de la plataforma ───────────────────────────────────────────

export function getPlatformSettings(): PlatformSettings {
  const raw = readPlatformSettings();
  return {
    defaultMonthlyPrice: Number(raw.defaultMonthlyPrice ?? 0),
    paymentInstructions: raw.paymentInstructions ?? '',
    reminderMessage: raw.reminderMessage || DEFAULT_REMINDER_MESSAGE,
  };
}

export function updatePlatformSettings(admin: Superadmin, settings: PlatformSettings, meta: Meta): PlatformSettings {
  controlTransaction(() => {
    writePlatformSettings(settings);
    insertPlatformAudit({ action: 'PLATFORM_SETTINGS_UPDATED', payload: { ...settings }, superadminId: admin.id, meta });
  });
  return getPlatformSettings();
}

// ─── Negocios ─────────────────────────────────────────────────────────────────

// Se mira la BD del negocio y no el código de activación: una BD migrada de la versión anterior
// ya trae dueño aunque nunca se haya usado un código.
function hasOwner(slug: string): boolean {
  return runWithTenant(slug, () => db.select({ id: users.id }).from(users).limit(1).get() !== undefined);
}

function toPlatformTenant(t: TenantRecord, defaultPrice: number, activated: boolean, today: string): PlatformTenant {
  const { status: subscription, daysLeft } = subscriptionStatus(t.paidUntil, today);
  return {
    slug: t.slug,
    name: t.name,
    status: t.status,
    createdAt: t.createdAt,
    contactName: t.contactName,
    contactPhone: t.contactPhone,
    notes: t.notes,
    monthlyPrice: t.monthlyPrice,
    effectivePrice: t.monthlyPrice ?? defaultPrice,
    paidUntil: t.paidUntil,
    subscription,
    daysLeft,
    activated,
  };
}

function requireTenant(slug: string): TenantRecord {
  const tenant = findTenant(slug);
  if (!tenant) throw new NegocioNoEncontrado();
  return tenant;
}

function platformTenant(slug: string): PlatformTenant {
  const tenant = requireTenant(slug);
  return toPlatformTenant(tenant, getPlatformSettings().defaultMonthlyPrice, hasOwner(slug), todayCR());
}

export function listPlatformTenants(): { tenants: PlatformTenant[]; summary: PlatformSummary } {
  const today = todayCR();
  const { defaultMonthlyPrice } = getPlatformSettings();
  const tenants = listTenants().map((t) => toPlatformTenant(t, defaultMonthlyPrice, hasOwner(t.slug), today));

  const active = tenants.filter((t) => t.status === 'active');
  const billed = active.filter((t) => t.subscription !== 'sin_cobro');
  const month = today.slice(0, 7);
  return {
    tenants,
    summary: {
      active: active.length,
      suspended: tenants.length - active.length,
      dueSoon: billed.filter((t) => t.subscription === 'por_vencer').length,
      overdue: billed.filter((t) => t.subscription === 'vencido').length,
      monthlyRevenue: billed.reduce((sum, t) => sum + t.effectivePrice, 0),
      collectedThisMonth: sumPaymentsBetween(`${month}-01`, `${month}-31`),
    },
  };
}

// Métricas mínimas para saber si el negocio usa el sistema. No expone datos de sus clientes.
function tenantUsage(slug: string): PlatformTenantDetail['usage'] {
  return runWithTenant(slug, () => {
    const userCount = db.select({ n: count() }).from(users).get()?.n ?? 0;
    const lastSale = db
      .select({ createdAt: sales.createdAt })
      .from(sales)
      .where(isNull(sales.deletedAt))
      .orderBy(desc(sales.id))
      .limit(1)
      .get();
    return { users: userCount, lastSaleAt: lastSale?.createdAt ?? null };
  });
}

function stripInternal({ previousPaidUntil: _, ...payment }: PaymentRecord) {
  return payment;
}

export function getTenantDetail(slug: string): PlatformTenantDetail {
  const tenant = platformTenant(slug);
  return {
    tenant,
    payments: listPayments(slug, { includeVoided: true, limit: 100 }).map(stripInternal),
    activity: listPlatformAudit(slug, 30),
    usage: tenantUsage(slug),
  };
}

export async function issueSetupCode(slug: string): Promise<string> {
  const code = generateSetupCode();
  setSetupCodeHash(slug, await hashSetupCode(code));
  return code;
}


export async function createTenant(
  admin: Superadmin,
  input: CreateTenantInput,
  meta: Meta,
): Promise<{ tenant: PlatformTenant; setupCode: string }> {
  if (findTenant(input.slug)) throw new NegocioYaExiste();

  // El hash se calcula antes de la transacción: better-sqlite3 no admite await dentro de ella.
  const code = generateSetupCode();
  const codeHash = await hashSetupCode(code);

  controlTransaction(() => {
    // Otra vez tras el await: dos altas simultáneas del mismo subdominio.
    if (findTenant(input.slug)) throw new NegocioYaExiste();
    insertTenant(input.slug, input.name);
    updateTenantFields(input.slug, {
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      notes: input.notes,
      monthlyPrice: input.monthlyPrice,
      paidUntil: input.paidUntil,
    });
    setSetupCodeHash(input.slug, codeHash);
    insertPlatformAudit({
      action: 'TENANT_CREATED',
      tenantSlug: input.slug,
      payload: { ...input },
      superadminId: admin.id,
      meta,
    });
  });
  // Crea el archivo de la BD y corre las migraciones ya, no en el primer acceso del dueño.
  openTenantDb(input.slug);

  return { tenant: platformTenant(input.slug), setupCode: code };
}

export function updateTenant(admin: Superadmin, slug: string, input: UpdateTenantInput, meta: Meta): PlatformTenant {
  const before = requireTenant(slug);
  controlTransaction(() => {
    updateTenantFields(slug, input);
    // Solo lo que cambió: el vencimiento corregido a mano queda visible en la actividad.
    const changes = Object.fromEntries(
      Object.entries(input).map(([k, v]) => [k, { from: before[k as keyof TenantRecord], to: v }]),
    );
    insertPlatformAudit({ action: 'TENANT_UPDATED', tenantSlug: slug, payload: changes, superadminId: admin.id, meta });
  });
  return platformTenant(slug);
}

export function changeTenantStatus(admin: Superadmin, slug: string, status: TenantStatus, meta: Meta): PlatformTenant {
  requireTenant(slug);
  controlTransaction(() => {
    setTenantStatus(slug, status);
    insertPlatformAudit({
      action: status === 'suspended' ? 'TENANT_SUSPENDED' : 'TENANT_ACTIVATED',
      tenantSlug: slug,
      superadminId: admin.id,
      meta,
    });
  });
  return platformTenant(slug);
}

export async function regenerateSetupCode(admin: Superadmin, slug: string, meta: Meta): Promise<string> {
  requireTenant(slug);
  if (hasOwner(slug)) throw new NegocioYaActivado();
  const code = await issueSetupCode(slug);
  insertPlatformAudit({ action: 'TENANT_SETUP_CODE_ISSUED', tenantSlug: slug, superadminId: admin.id, meta });
  return code;
}

// ─── Pagos ────────────────────────────────────────────────────────────────────

// El pago extiende desde el vencimiento actual aunque ya haya pasado: el negocio siguió
// usando el sistema durante el atraso (nunca se bloquea por falta de pago), así que esos
// días también se cobran. Un negocio sin cobro empieza a contar desde hoy.
export function recordPayment(
  admin: Superadmin,
  slug: string,
  input: RecordPaymentInput,
  meta: Meta,
): PlatformTenant {
  const tenant = requireTenant(slug);
  const periodFrom = tenant.paidUntil ?? todayCR();
  const periodTo = addMonths(periodFrom, input.months);

  controlTransaction(() => {
    const id = insertPayment({
      tenantSlug: slug,
      amount: input.amount,
      months: input.months,
      method: input.method,
      reference: input.reference,
      paidAt: input.paidAt,
      periodFrom,
      periodTo,
      previousPaidUntil: tenant.paidUntil,
      notes: input.notes,
      superadminId: admin.id,
    });
    updateTenantFields(slug, { paidUntil: periodTo });
    insertPlatformAudit({
      action: 'PAYMENT_RECORDED',
      tenantSlug: slug,
      payload: { paymentId: id, ...input, periodFrom, periodTo },
      superadminId: admin.id,
      meta,
    });
  });
  return platformTenant(slug);
}

// Anular devuelve el vencimiento solo si es el último pago y nadie corrigió la fecha después;
// en otro caso el superadministrador ajusta el vencimiento a mano.
export function voidPayment(
  admin: Superadmin,
  slug: string,
  paymentId: number,
  meta: Meta,
): { tenant: PlatformTenant; paidUntilReverted: boolean } {
  const tenant = requireTenant(slug);
  const payment = findPayment(slug, paymentId);
  if (!payment) throw new PagoNoEncontrado();
  if (payment.voidedAt) throw new PagoYaAnulado();

  const revert = latestActivePaymentId(slug) === payment.id && tenant.paidUntil === payment.periodTo;

  controlTransaction(() => {
    markPaymentVoided(payment.id);
    if (revert) updateTenantFields(slug, { paidUntil: payment.previousPaidUntil });
    insertPlatformAudit({
      action: 'PAYMENT_VOIDED',
      tenantSlug: slug,
      payload: { paymentId: payment.id, amount: payment.amount, paidUntilReverted: revert },
      superadminId: admin.id,
      meta,
    });
  });
  return { tenant: platformTenant(slug), paidUntilReverted: revert };
}

// ─── Lo que ve el propio negocio ──────────────────────────────────────────────

export function tenantSubscriptionInfo(slug: string): SubscriptionInfo {
  const tenant = requireTenant(slug);
  const settings = getPlatformSettings();
  const { status, daysLeft } = subscriptionStatus(tenant.paidUntil, todayCR());
  return {
    status,
    paidUntil: tenant.paidUntil,
    daysLeft,
    monthlyPrice: tenant.monthlyPrice ?? settings.defaultMonthlyPrice,
    paymentInstructions: settings.paymentInstructions,
    payments: listPayments(slug, { includeVoided: false, limit: 12 }).map((p) => ({
      id: p.id,
      amount: p.amount,
      months: p.months,
      method: p.method,
      paidAt: p.paidAt,
      periodTo: p.periodTo,
    })),
  };
}
