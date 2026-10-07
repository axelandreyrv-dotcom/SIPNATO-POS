import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, X } from 'lucide-react';
import { formatColones, type SubscriptionInfo } from '@sipnato/shared';
import { fmtDate } from '@/lib/format';
import { useCurrentUser } from '../auth/useCurrentUser';
import { subscriptionApi } from './api';

const DISMISS_KEY = 'dosuxsoft-subscription-notice';

export function useSubscription(enabled: boolean) {
  return useQuery({
    queryKey: ['subscription'],
    queryFn: subscriptionApi.get,
    enabled,
    // Tras registrar un pago en el panel, el aviso desaparece en minutos sin recargar.
    staleTime: 10 * 60 * 1000,
  });
}

function dueLine(info: SubscriptionInfo): string {
  const date = info.paidUntil ? fmtDate(info.paidUntil) : '';
  if (info.status === 'vencido') return `La mensualidad de ${formatColones(info.monthlyPrice)} venció el ${date}.`;
  if (info.daysLeft === 0) return `La mensualidad de ${formatColones(info.monthlyPrice)} vence hoy.`;
  if (info.daysLeft === 1) return `La mensualidad de ${formatColones(info.monthlyPrice)} vence mañana.`;
  return `La mensualidad de ${formatColones(info.monthlyPrice)} vence el ${date}.`;
}

// Aviso de pago para dueño y administradores. Nunca bloquea: el sistema sigue funcionando.
// Se puede cerrar por la sesión del navegador; vuelve si cambia el vencimiento.
export function SubscriptionNotice() {
  const user = useCurrentUser();
  const allowed = user.role === 'dueno' || user.role === 'admin';
  const { data } = useSubscription(allowed);
  const [dismissed, setDismissed] = useState(() => readDismissed());
  const [showHow, setShowHow] = useState(false);

  if (!data || (data.status !== 'vencido' && data.status !== 'por_vencer')) return null;
  const key = `${data.status}:${data.paidUntil}`;
  if (dismissed === key) return null;

  const overdue = data.status === 'vencido';
  return (
    <div
      role="status"
      className={[
        'border-b px-4 py-2.5 text-sm sm:px-8',
        overdue
          ? 'border-brand-error/20 bg-brand-error/[0.07] text-text-primary'
          : 'border-brand-warning/25 bg-brand-warning/[0.08] text-text-primary',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          size={16}
          strokeWidth={1.5}
          className={`mt-0.5 shrink-0 ${overdue ? 'text-brand-error' : 'text-brand-warning'}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p>
            {dueLine(data)}{' '}
            {data.paymentInstructions && (
              <button
                type="button"
                onClick={() => setShowHow((v) => !v)}
                aria-expanded={showHow}
                className="font-medium text-brand-blue hover:underline"
              >
                {showHow ? 'Ocultar' : 'Cómo pagar'}
              </button>
            )}
          </p>
          {showHow && (
            <p className="mt-1.5 whitespace-pre-line text-text-secondary">{data.paymentInstructions}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            writeDismissed(key);
            setDismissed(key);
          }}
          className="-my-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-border/60 hover:text-text-primary"
          aria-label="Cerrar aviso"
        >
          <X size={16} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function readDismissed(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(key: string): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, key);
  } catch {
    // Sin almacenamiento el aviso solo se oculta hasta recargar.
  }
}
