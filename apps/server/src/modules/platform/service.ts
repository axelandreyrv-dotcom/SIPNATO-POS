import { env } from 'cloudflare:workers';
import {
  addMonths,
  DEFAULT_REMINDER_MESSAGE,
  TEMPLATE_INFO,
  type AssignBusinessInput,
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
import {
  consumeSetupCodeHash,
  controlTransaction,
  deleteTenantRecord,
  findTenant,
  getSetupCodeHash,
  insertTenant,
  latestExchangeRate,
  listTenants,
  saveExchangeRate,
  setSetupCodeHash,
  setTenantStatus,
  type TenantRecord,
  type TenantStatus,
} from '../../db/control.js';
import type { TenantPlatformSummary } from '../../do/tenant-do.js';
import { fetchBccrRates } from '../../lib/bccr.js';
import { todayCR } from '../../lib/cr-time.js';
import {
  DUMMY_HASH,
  generateSessionToken,
  generateSetupCode,
  generateTemporaryPassword,
  hashPassword,
  hashSessionToken,
  hashSetupCode,
  verifyPassword,
  verifySetupCode,
} from '../../lib/crypto.js';
import {
  CredencialesInvalidas,
  NegocioNoDisponible,
  NegocioNoEncontrado,
  NegocioNoSuspendido,
  NegocioYaActivado,
  NegocioYaExiste,
  PagoNoEncontrado,
  PagoYaAnulado,
  SuperadminNoEncontrado,
  SuperadminYaExiste,
  UsuarioBloqueado,
} from '../../lib/errors.js';
import { tenantStub } from '../../lib/platform-client.js';
import { INACTIVITY_TIMEOUT_MS, SESSION_DURATION_MS } from '../../lib/session.js';
import {
  deletePlatformSession,
  deleteSuperadminSessions,
  findPayment,
  findPlatformSession,
  findSuperadminById,
  findSuperadminByUsername,
  insertPayment,
  insertPlatformAudit,
  insertPlatformSession,
  insertSuperadmin,
  latestActivePaymentId,
  listPayments,
  listPlatformAudit,
  listSuperadmins,
  markPaymentVoided,
  readPlatformSettings,
  recordSuperadminFailure,
  resetSuperadminFailures,
  setSuperadminActive,
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
  if (admin?.locked_until && new Date(admin.locked_until).getTime() > Date.now())
    throw new UsuarioBloqueado();

  const valid = await verifyPassword(password, admin?.password_hash ?? DUMMY_HASH);
  if (!admin || !admin.active || !valid) {
    if (admin && admin.active && !valid) {
      const attempts = admin.failed_attempts + 1;
      const lockedUntil =
        attempts >= MAX_FAILED_ATTEMPTS
          ? new Date(Date.now() + LOCK_DURATION_MS).toISOString()
          : null;
      recordSuperadminFailure(admin.id, lockedUntil ? 0 : attempts, lockedUntil);
      if (lockedUntil) throw new UsuarioBloqueado();
    }
    throw new CredencialesInvalidas();
  }
  if (admin.failed_attempts > 0 || admin.locked_until) resetSuperadminFailures(admin.id);
  return admin;
}

async function openSession(superadminId: number, meta: Meta): Promise<string> {
  const token = generateSessionToken();
  insertPlatformSession({
    id: crypto.randomUUID(),
    superadminId,
    tokenHash: await hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
    meta,
  });
  return token;
}

export async function loginSuperadmin(
  username: string,
  password: string,
  meta: Meta,
): Promise<string> {
  let admin;
  try {
    admin = await verifySuperadminCredentials(username, password);
  } catch (err) {
    insertPlatformAudit({
      action: 'PLATFORM_LOGIN_FAILED',
      payload: { username },
      superadminId: null,
      meta,
    });
    throw err;
  }
  insertPlatformAudit({ action: 'PLATFORM_LOGIN', superadminId: admin.id, meta });
  return openSession(admin.id, meta);
}

export async function verifyPlatformSession(
  token: string,
): Promise<{ sessionId: string; admin: Superadmin } | null> {
  const session = findPlatformSession(await hashSessionToken(token));
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

// ─── Cuentas de superadministrador ────────────────────────────────────────────
// No hay alta ni recuperación desde el panel: quien controla el panel controla todos los
// negocios. Solo la consola de operaciones (/internal/ops) llama a estas funciones.

// 18 bytes → 24 caracteres: se copia una vez y se cambia en "Mi cuenta" del panel.
const SUPERADMIN_TEMP_PASSWORD_BYTES = 18;

function requireSuperadmin(username: string) {
  const admin = findSuperadminByUsername(username);
  if (!admin) throw new SuperadminNoEncontrado();
  return admin;
}

export async function createSuperadminAccount(username: string): Promise<string> {
  const tempPassword = generateTemporaryPassword(SUPERADMIN_TEMP_PASSWORD_BYTES);
  // El hash va primero: entre la verificación y la inserción no hay await (CLAUDE.md §6.13).
  const hash = await hashPassword(tempPassword);
  controlTransaction(() => {
    if (findSuperadminByUsername(username)) throw new SuperadminYaExiste();
    insertSuperadmin(username, hash);
  });
  return tempPassword;
}

// Contraseña temporal nueva, desbloquea la cuenta y cierra todas sus sesiones.
export async function resetSuperadminPassword(username: string): Promise<string> {
  requireSuperadmin(username);
  const tempPassword = generateTemporaryPassword(SUPERADMIN_TEMP_PASSWORD_BYTES);
  const hash = await hashPassword(tempPassword);
  controlTransaction(() => {
    const admin = requireSuperadmin(username);
    updateSuperadminPassword(admin.id, hash);
    deleteSuperadminSessions(admin.id);
  });
  return tempPassword;
}

// Desactivar cierra sus sesiones; la cuenta nunca se borra.
export function setSuperadminEnabled(username: string, enabled: boolean): void {
  controlTransaction(() => {
    const admin = requireSuperadmin(username);
    setSuperadminActive(admin.id, enabled);
    if (!enabled) deleteSuperadminSessions(admin.id);
  });
}

export function listSuperadminAccounts(): {
  username: string;
  active: boolean;
  locked: boolean;
  createdAt: string;
}[] {
  const now = Date.now();
  return listSuperadmins().map((a) => ({
    username: a.username,
    active: a.active === 1,
    locked: a.locked_until !== null && new Date(a.locked_until).getTime() > now,
    createdAt: a.created_at,
  }));
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

export function updatePlatformSettings(
  admin: Superadmin,
  settings: PlatformSettings,
  meta: Meta,
): PlatformSettings {
  controlTransaction(() => {
    writePlatformSettings(settings);
    insertPlatformAudit({
      action: 'PLATFORM_SETTINGS_UPDATED',
      payload: { ...settings },
      superadminId: admin.id,
      meta,
    });
  });
  return getPlatformSettings();
}

// ─── Negocios ─────────────────────────────────────────────────────────────────

export const tenantDO = (slug: string) => tenantStub(env, slug);

const DEFAULT_ASSIGNMENT: AssignBusinessInput = {
  template: 'generico',
  modules: [...TEMPLATE_INFO.generico.profile.modules],
};

type TenantInfo = Pick<PlatformTenant, 'activated' | 'template' | 'modules' | 'unavailable'>;

// Lo que el panel muestra de la BD del negocio. Se mira si ya tiene usuarios y no el código de
// activación: una BD importada ya trae dueño aunque nunca se haya usado un código. Un DO que
// nunca se inicializó (el alta falló a medias) aparece "Sin activar".
function infoFrom(summary: TenantPlatformSummary | null): TenantInfo {
  if (!summary) return { activated: false, template: 'generico', modules: [], unavailable: false };
  return {
    activated: summary.activated,
    template: summary.template,
    modules: summary.modules,
    unavailable: false,
  };
}

const UNAVAILABLE_INFO: TenantInfo = {
  activated: false,
  template: 'generico',
  modules: [],
  unavailable: true,
};

// Un DO colgado (no falla, solo no contesta) dejaría esperando a todo el panel, porque la lista
// pregunta a todos los negocios a la vez.
const SUMMARY_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`sin respuesta en ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// El resumen que el panel le pide a cada negocio. Un DO que falla o tarda más de 5 s no tumba el
// panel ni convierte en error una escritura ya guardada en control.db (el operador la repetiría:
// un pago doble): el negocio se muestra "No disponible". En el log solo el subdominio y el mensaje.
async function tenantSummary(
  slug: string,
): Promise<{ summary: TenantPlatformSummary | null; info: TenantInfo }> {
  try {
    const summary = await withTimeout(
      Promise.resolve(tenantDO(slug).platformSummary()),
      SUMMARY_TIMEOUT_MS,
    );
    return { summary, info: infoFrom(summary) };
  } catch (err) {
    console.error(
      `El negocio "${slug}" no respondió al panel:`,
      (err as Error)?.message ?? String(err),
    );
    return { summary: null, info: UNAVAILABLE_INFO };
  }
}

function toPlatformTenant(
  t: TenantRecord,
  defaultPrice: number,
  info: TenantInfo,
  today: string,
): PlatformTenant {
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
    ...info,
  };
}

function requireTenant(slug: string): TenantRecord {
  const tenant = findTenant(slug);
  if (!tenant) throw new NegocioNoEncontrado();
  return tenant;
}

async function platformTenant(slug: string): Promise<PlatformTenant> {
  const { info } = await tenantSummary(slug);
  // Se lee después del RPC: así refleja lo último que se escribió en control.db.
  return toPlatformTenant(
    requireTenant(slug),
    getPlatformSettings().defaultMonthlyPrice,
    info,
    todayCR(),
  );
}

export async function listPlatformTenants(): Promise<{
  tenants: PlatformTenant[];
  summary: PlatformSummary;
}> {
  const records = listTenants();
  const infos = await Promise.all(records.map((t) => tenantSummary(t.slug)));
  const today = todayCR();
  const { defaultMonthlyPrice } = getPlatformSettings();
  const tenants = records.map((t, i) =>
    toPlatformTenant(t, defaultMonthlyPrice, infos[i]!.info, today),
  );

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

function stripInternal({ previousPaidUntil: _, ...payment }: PaymentRecord) {
  return payment;
}

export async function getTenantDetail(slug: string): Promise<PlatformTenantDetail> {
  requireTenant(slug);
  // Métricas mínimas para saber si el negocio usa el sistema. No expone datos de sus clientes.
  const { summary, info } = await tenantSummary(slug);
  return {
    tenant: toPlatformTenant(
      requireTenant(slug),
      getPlatformSettings().defaultMonthlyPrice,
      info,
      todayCR(),
    ),
    payments: listPayments(slug, { includeVoided: true, limit: 100 }).map(stripInternal),
    activity: listPlatformAudit(slug, 30),
    usage: { users: summary?.users ?? 0, lastSaleAt: summary?.lastSaleAt ?? null },
  };
}

export async function createTenant(
  admin: Superadmin | null,
  input: CreateTenantInput,
  meta: Meta,
): Promise<{ tenant: PlatformTenant; setupCode: string }> {
  if (findTenant(input.slug)) throw new NegocioYaExiste();

  // El hash va primero: entre la verificación de que el subdominio está libre y la inserción no
  // puede haber ningún await (CLAUDE.md §6.13).
  const code = generateSetupCode();
  const codeHash = await hashSetupCode(code);

  controlTransaction(() => {
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
      superadminId: admin?.id ?? null,
      meta,
    });
  });
  // Crea la BD del negocio ya (no en el primer acceso del dueño) y deja asignados el tipo de
  // negocio y los módulos (el dueño no los elige).
  await tenantDO(input.slug).initialize(input.slug, {
    template: input.template,
    modules: input.modules ?? [...TEMPLATE_INFO[input.template].profile.modules],
  });

  return { tenant: await platformTenant(input.slug), setupCode: code };
}

// Tipo de negocio y módulos: solo desde aquí. Cambiar el tipo reemplaza nombres y campos de las
// órdenes por los de la plantilla; las órdenes existentes conservan sus propias etiquetas.
export async function assignTenantBusiness(
  admin: Superadmin,
  slug: string,
  input: AssignBusinessInput,
  meta: Meta,
): Promise<PlatformTenant> {
  requireTenant(slug);
  const stub = tenantDO(slug);
  let before: Pick<TenantPlatformSummary, 'template' | 'modules'> | null = null;
  let after: Pick<TenantPlatformSummary, 'template' | 'modules'>;
  // Aquí el RPC es la escritura: si falla no se guardó nada y la actividad no lo registra.
  try {
    if ((await stub.platformSummary()) === null) {
      // El alta falló antes de inicializar el DO: asignar el tipo lo termina de crear.
      await stub.initialize(slug, input);
      after = { template: input.template, modules: [...input.modules] };
    } else {
      ({ before, after } = await stub.assignBusiness(input, meta));
    }
  } catch (err) {
    console.error(
      `No se pudo asignar el tipo al negocio "${slug}":`,
      (err as Error)?.message ?? String(err),
    );
    throw new NegocioNoDisponible();
  }
  insertPlatformAudit({
    action: 'TENANT_BUSINESS_ASSIGNED',
    tenantSlug: slug,
    payload: {
      template: { from: before?.template ?? null, to: after.template },
      modules: { from: before?.modules ?? null, to: after.modules },
    },
    superadminId: admin.id,
    meta,
  });
  return platformTenant(slug);
}

export async function updateTenant(
  admin: Superadmin,
  slug: string,
  input: UpdateTenantInput,
  meta: Meta,
): Promise<PlatformTenant> {
  const before = requireTenant(slug);
  controlTransaction(() => {
    updateTenantFields(slug, input);
    // Solo lo que cambió: el vencimiento corregido a mano queda visible en la actividad.
    const changes = Object.fromEntries(
      Object.entries(input).map(([k, v]) => [k, { from: before[k as keyof TenantRecord], to: v }]),
    );
    insertPlatformAudit({
      action: 'TENANT_UPDATED',
      tenantSlug: slug,
      payload: changes,
      superadminId: admin.id,
      meta,
    });
  });
  return platformTenant(slug);
}

export async function changeTenantStatus(
  admin: Superadmin | null,
  slug: string,
  status: TenantStatus,
  meta: Meta,
): Promise<PlatformTenant> {
  requireTenant(slug);
  controlTransaction(() => {
    setTenantStatus(slug, status);
    insertPlatformAudit({
      action: status === 'suspended' ? 'TENANT_SUSPENDED' : 'TENANT_ACTIVATED',
      tenantSlug: slug,
      superadminId: admin?.id ?? null,
      meta,
    });
  });
  return platformTenant(slug);
}

// Irreversible (solo por consola; el panel no lo ofrece). Primero se vacía el DO: si eso falla
// control.db no cambia y el operador reintenta. Al revés quedaría un DO con datos y sin registro,
// al que ya no se llega para borrarlo. Las copias en R2 se conservan hasta su rotación.
export async function deleteSuspendedTenant(slug: string): Promise<{ name: string }> {
  const tenant = requireTenant(slug);
  if (tenant.status !== 'suspended') throw new NegocioNoSuspendido();
  try {
    await tenantDO(slug).destroy();
  } catch (err) {
    console.error(
      `No se pudo vaciar el negocio "${slug}":`,
      (err as Error)?.message ?? String(err),
    );
    throw new NegocioNoDisponible();
  }
  // Sin volver a mirar el estado: el DO ya está vacío y el registro no debe quedar apuntándole.
  controlTransaction(() => deleteTenantRecord(slug));
  return { name: tenant.name };
}

// Sirve también si el código se gastó y el dueño no llegó a crearse: mientras el negocio no
// tenga usuarios se puede emitir otro.
export async function regenerateSetupCode(
  admin: Superadmin | null,
  slug: string,
  meta: Meta,
): Promise<string> {
  requireTenant(slug);
  const stub = tenantDO(slug);
  const summary = await stub.platformSummary();
  if (summary?.activated) throw new NegocioYaActivado();
  // El alta falló antes de inicializar el DO: sin esto el código nunca serviría (el subdominio
  // respondería 404). Se inicializa con el tipo por defecto, como el alta por consola.
  if (summary === null) await stub.initialize(slug, DEFAULT_ASSIGNMENT);
  const code = generateSetupCode();
  const codeHash = await hashSetupCode(code);
  controlTransaction(() => {
    setSetupCodeHash(slug, codeHash);
    insertPlatformAudit({
      action: 'TENANT_SETUP_CODE_ISSUED',
      tenantSlug: slug,
      superadminId: admin?.id ?? null,
      meta,
    });
  });
  return code;
}

// El negocio lo pide al activar a su dueño. Verifica y gasta el código antes de que exista el
// dueño: un código equivocado no cambia nada y uno correcto solo sirve una vez, aunque lleguen
// dos activaciones a la vez.
export async function consumeSetupCode(slug: string, code: string): Promise<boolean> {
  const hash = getSetupCodeHash(slug);
  if (!hash || !(await verifySetupCode(code, hash))) return false;
  return consumeSetupCodeHash(slug, hash);
}

// ─── Pagos ────────────────────────────────────────────────────────────────────

// El pago extiende desde el vencimiento actual aunque ya haya pasado: el negocio siguió
// usando el sistema durante el atraso (nunca se bloquea por falta de pago), así que esos
// días también se cobran. Un negocio sin cobro empieza a contar desde hoy.
export async function recordPayment(
  admin: Superadmin,
  slug: string,
  input: RecordPaymentInput,
  meta: Meta,
): Promise<PlatformTenant> {
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
export async function voidPayment(
  admin: Superadmin,
  slug: string,
  paymentId: number,
  meta: Meta,
): Promise<{ tenant: PlatformTenant; paidUntilReverted: boolean }> {
  const tenant = requireTenant(slug);
  const payment = findPayment(slug, paymentId);
  if (!payment) throw new PagoNoEncontrado();
  if (payment.voidedAt) throw new PagoYaAnulado();

  const revert =
    latestActivePaymentId(slug) === payment.id && tenant.paidUntil === payment.periodTo;

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
  return { tenant: await platformTenant(slug), paidUntilReverted: revert };
}

// ─── Lo que ve el propio negocio ──────────────────────────────────────────────

export function tenantSubscriptionInfo(slug: string): SubscriptionInfo | null {
  const tenant = findTenant(slug);
  if (!tenant) return null;
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

// ─── Tipo de cambio del BCCR ──────────────────────────────────────────────────

function daysAgo(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Trae la última semana (cubre fines de semana y feriados sin dato) y guarda cada día. Global:
// el tipo de cambio del BCCR es el mismo para todos los negocios.
export async function refreshExchangeRate(token: string | undefined): Promise<void> {
  if (!token) return;
  const today = todayCR();
  if (latestExchangeRate()?.date === today) return;

  try {
    const rates = await fetchBccrRates(daysAgo(today, 7), today, token);
    controlTransaction(() => {
      for (const r of rates) saveExchangeRate(r.date, r.buy, r.sell);
    });
  } catch (err) {
    // No es fatal: se reintenta en la próxima hora y mientras tanto rige el último guardado
    // o el tipo de respaldo de cada negocio.
    console.warn('no se pudo consultar el tipo de cambio del BCCR:', (err as Error).message);
  }
}
