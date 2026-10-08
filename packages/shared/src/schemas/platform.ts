import { z } from 'zod';
import { passwordSchema, usernameSchema } from './auth.js';
import {
  BUSINESS_TEMPLATES,
  TOGGLEABLE_MODULES,
  type BusinessTemplate,
  type ModuleKey,
} from './business.js';

// Panel de superadministrador (Fase F): alta de negocios, cobro manual de la suscripción
// (SINPE / transferencia) y avisos de vencimiento. Un atraso NUNCA bloquea al negocio:
// solo se avisa, y el superadministrador suspende a mano si lo decide.

// ─── Subdominio del negocio ───────────────────────────────────────────────────

// Un label DNS: minúsculas, dígitos y guiones, sin guion al inicio/final, máx. 32 chars.
// En el servidor también es la barrera contra path traversal: el slug termina en un nombre de archivo.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

// Subdominios que nunca pueden ser un negocio. `admin` es el panel de superadministrador.
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'www',
  'api',
  'app',
  'admin',
  'mail',
  'static',
  'assets',
  'control',
]);

export const PLATFORM_SUBDOMAIN = 'admin';

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(
    isValidSlug,
    'Subdominio: minúsculas, números y guiones (máx. 32), sin guion al inicio ni al final',
  );

// ─── Fechas de la suscripción ─────────────────────────────────────────────────
// `paidUntil` es el último día cubierto (YYYY-MM-DD, calendario de Costa Rica).

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
  .refine(
    (d) =>
      !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) &&
      new Date(`${d}T00:00:00Z`).toISOString().startsWith(d),
    'Fecha inválida',
  );

// Suma meses de calendario. Si el día no existe en el mes destino (31 → febrero) se usa el último.
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// Días antes del vencimiento en que el negocio empieza a ver el aviso.
export const DUE_SOON_DAYS = 5;

export const SUBSCRIPTION_STATUSES = ['al_dia', 'por_vencer', 'vencido', 'sin_cobro'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  al_dia: 'Al día',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  sin_cobro: 'Sin cobro',
};

export function subscriptionStatus(
  paidUntil: string | null,
  today: string,
): { status: SubscriptionStatus; daysLeft: number | null } {
  if (!paidUntil) return { status: 'sin_cobro', daysLeft: null };
  const daysLeft = daysBetween(today, paidUntil);
  if (daysLeft < 0) return { status: 'vencido', daysLeft };
  if (daysLeft <= DUE_SOON_DAYS) return { status: 'por_vencer', daysLeft };
  return { status: 'al_dia', daysLeft };
}

// ─── Pagos ────────────────────────────────────────────────────────────────────

export const SUBSCRIPTION_PAYMENT_METHODS = ['sinpe', 'transferencia', 'efectivo', 'otro'] as const;
export type SubscriptionPaymentMethod = (typeof SUBSCRIPTION_PAYMENT_METHODS)[number];

export const SUBSCRIPTION_PAYMENT_METHOD_LABELS: Record<SubscriptionPaymentMethod, string> = {
  sinpe: 'SINPE Móvil',
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
  otro: 'Otro',
};

const colonesSchema = z.number().int('Monto en colones, sin decimales').min(0).max(100_000_000);
const optionalText = (max: number) => z.string().trim().max(max).default('');
const phoneSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{8}$/.test(v), 'Celular: 8 dígitos')
  .default('');

export const recordPaymentSchema = z.object({
  amount: colonesSchema,
  months: z.number().int().min(1, 'Al menos 1 mes').max(24),
  method: z.enum(SUBSCRIPTION_PAYMENT_METHODS),
  reference: optionalText(100),
  paidAt: isoDateSchema,
  notes: optionalText(500),
});

// ─── Negocios ─────────────────────────────────────────────────────────────────

export const createTenantSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1, 'El nombre es requerido').max(80),
  contactName: optionalText(80),
  contactPhone: phoneSchema,
  // null = precio por defecto de la plataforma.
  monthlyPrice: colonesSchema.nullable().default(null),
  // null = sin cobro (negocio propio, cortesía).
  paidUntil: isoDateSchema.nullable(),
  notes: optionalText(2000),
  // Tipo de negocio y módulos: los decide la plataforma, no el dueño. Sin módulos = los de la plantilla.
  template: z.enum(BUSINESS_TEMPLATES).default('generico'),
  modules: z
    .array(z.enum(TOGGLEABLE_MODULES))
    .refine((m) => new Set(m).size === m.length, 'Hay módulos repetidos')
    .optional(),
});

export const updateTenantSchema = z
  .object({
    name: z.string().trim().min(1, 'El nombre es requerido').max(80),
    contactName: z.string().trim().max(80),
    contactPhone: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d{8}$/.test(v), 'Celular: 8 dígitos'),
    monthlyPrice: colonesSchema.nullable(),
    paidUntil: isoDateSchema.nullable(),
    notes: z.string().trim().max(2000),
  })
  .partial();

export const tenantStatusSchema = z.object({ status: z.enum(['active', 'suspended']) });

// ─── Configuración de la plataforma ───────────────────────────────────────────

export const DEFAULT_REMINDER_MESSAGE =
  'Hola {contacto}, le recordamos que la mensualidad de Dosuxsoft POS para {negocio} ({monto}) vence el {vence}.\n{instrucciones}\n¡Gracias!';

export const REMINDER_VARIABLES = ['contacto', 'negocio', 'monto', 'vence', 'instrucciones'];

export const platformSettingsSchema = z.object({
  defaultMonthlyPrice: colonesSchema,
  // Lo que ve el negocio en su aviso de vencimiento: SINPE, cuenta IBAN, a quién avisar.
  paymentInstructions: z.string().trim().max(1000),
  reminderMessage: z.string().trim().max(1000),
});

// ─── Auth del superadministrador ──────────────────────────────────────────────

export const platformLoginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Ingresa tu usuario').max(32),
  password: z.string().min(1, 'Ingresa tu contraseña').max(128),
});

export const platformChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Ingresa tu contraseña actual').max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

export const superadminUsernameSchema = usernameSchema;

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;

export interface Superadmin {
  id: number;
  username: string;
}

export interface PlatformTenant {
  slug: string;
  name: string;
  status: 'active' | 'suspended';
  createdAt: string;
  contactName: string;
  contactPhone: string;
  notes: string;
  monthlyPrice: number | null;
  // Precio que se cobra: el especial o el de la plataforma.
  effectivePrice: number;
  paidUntil: string | null;
  subscription: SubscriptionStatus;
  daysLeft: number | null;
  // false = el dueño todavía no creó su cuenta.
  activated: boolean;
  template: BusinessTemplate;
  modules: ModuleKey[];
}

export interface PlatformSummary {
  active: number;
  suspended: number;
  dueSoon: number;
  overdue: number;
  // Suma de precios de los negocios activos que pagan.
  monthlyRevenue: number;
  collectedThisMonth: number;
}

export interface SubscriptionPayment {
  id: number;
  tenantSlug: string;
  amount: number;
  months: number;
  method: SubscriptionPaymentMethod;
  reference: string;
  paidAt: string;
  periodFrom: string;
  periodTo: string;
  notes: string;
  voidedAt: string | null;
  recordedBy: string | null;
  createdAt: string;
}

export interface PlatformAuditEntry {
  id: number;
  action: string;
  payload: Record<string, unknown> | null;
  superadmin: string | null;
  createdAt: string;
}

export interface PlatformTenantDetail {
  tenant: PlatformTenant;
  payments: SubscriptionPayment[];
  activity: PlatformAuditEntry[];
  usage: { users: number; lastSaleAt: string | null };
}

// Lo que ve el propio negocio (dueño y administradores).
export interface SubscriptionInfo {
  status: SubscriptionStatus;
  paidUntil: string | null;
  daysLeft: number | null;
  monthlyPrice: number;
  paymentInstructions: string;
  payments: Pick<
    SubscriptionPayment,
    'id' | 'amount' | 'months' | 'method' | 'paidAt' | 'periodTo'
  >[];
}
