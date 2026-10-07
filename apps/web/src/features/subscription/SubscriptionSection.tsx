import {
  formatColones,
  SUBSCRIPTION_PAYMENT_METHOD_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  type SubscriptionStatus,
} from '@sipnato/shared';
import { fmtDate } from '@/lib/format';
import { Section } from '../settings/ui';
import { useSubscription } from './SubscriptionNotice';

const STATUS_TONE: Record<SubscriptionStatus, string> = {
  al_dia: 'text-brand-success',
  por_vencer: 'text-brand-warning',
  vencido: 'text-brand-error',
  sin_cobro: 'text-text-secondary',
};

export function SubscriptionSection() {
  const { data, isPending, error } = useSubscription(true);

  return (
    <Section title="Suscripción" description="Mensualidad de Dosuxsoft POS y pagos registrados.">
      {error ? (
        <p className="text-sm text-text-muted">No se pudo cargar la suscripción.</p>
      ) : isPending ? (
        <div className="h-16 animate-pulse rounded-lg bg-border/40" />
      ) : data.status === 'sin_cobro' ? (
        <p className="text-sm text-text-secondary">Este negocio no tiene mensualidad.</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-xs text-text-muted">Estado</dt>
              <dd className={`mt-0.5 font-medium ${STATUS_TONE[data.status]}`}>
                {SUBSCRIPTION_STATUS_LABELS[data.status]}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Pagado hasta</dt>
              <dd className="mt-0.5 font-medium text-text-primary">
                {data.paidUntil ? fmtDate(data.paidUntil) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Mensualidad</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-text-primary">
                {formatColones(data.monthlyPrice)}
              </dd>
            </div>
          </dl>
          {data.paymentInstructions && (
            <div>
              <p className="text-xs text-text-muted">Cómo pagar</p>
              <p className="mt-0.5 whitespace-pre-line text-sm text-text-secondary">
                {data.paymentInstructions}
              </p>
            </div>
          )}
          {data.payments.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-text-muted">Últimos pagos</p>
              <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                {data.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-x-4 px-3 py-2">
                    <span className="tabular-nums text-text-primary">
                      {formatColones(p.amount)}
                      <span className="ml-2 text-text-muted">
                        {SUBSCRIPTION_PAYMENT_METHOD_LABELS[p.method]}
                      </span>
                    </span>
                    <span className="text-text-secondary">
                      {fmtDate(p.paidAt)} · hasta {fmtDate(p.periodTo)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
