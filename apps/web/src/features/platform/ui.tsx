import {
  SUBSCRIPTION_STATUS_LABELS,
  type PlatformTenant,
  type SubscriptionStatus,
} from '@sipnato/shared';
import { ApiError } from '@/lib/api-client';

export { FieldLabel, inputClass, textareaClass } from '../settings/ui';

export const primaryButton =
  'inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white transition-[filter] duration-150 hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:hover:brightness-100';

export const secondaryButton =
  'inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-text-primary transition-colors duration-150 hover:bg-brand-blue/5 disabled:opacity-50';

export const dangerButton =
  'inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand-error px-4 text-sm font-medium text-white transition-[filter] duration-150 hover:brightness-110 disabled:opacity-50';

export function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor.';
}

export function todayCR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date());
}

// El panel vive en admin.<dominio>; cada negocio en <slug>.<dominio> (mismo puerto en desarrollo).
export function tenantHost(slug: string): string {
  return `${slug}.${window.location.host.replace(/^admin\./, '')}`;
}

export function tenantUrl(slug: string): string {
  return `${window.location.protocol}//${tenantHost(slug)}`;
}

const STATUS_STYLE: Record<SubscriptionStatus, string> = {
  al_dia: 'bg-brand-success/10 text-brand-success',
  por_vencer: 'bg-brand-warning/12 text-brand-warning',
  vencido: 'bg-brand-error/10 text-brand-error',
  sin_cobro: 'bg-border text-text-secondary',
};

export function SubscriptionBadge({ status }: { status: SubscriptionStatus }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      {SUBSCRIPTION_STATUS_LABELS[status]}
    </span>
  );
}

export function SuspendedBadge() {
  return (
    <span className="inline-flex h-6 items-center rounded-md bg-text-primary px-2 text-xs font-medium text-surface-card">
      Suspendido
    </span>
  );
}

export function dueText(t: Pick<PlatformTenant, 'paidUntil' | 'daysLeft'>): string {
  if (!t.paidUntil || t.daysLeft === null) return 'No se le cobra';
  if (t.daysLeft < -1) return `Venció hace ${-t.daysLeft} días`;
  if (t.daysLeft === -1) return 'Venció ayer';
  if (t.daysLeft === 0) return 'Vence hoy';
  if (t.daysLeft === 1) return 'Vence mañana';
  return `Vence en ${t.daysLeft} días`;
}
