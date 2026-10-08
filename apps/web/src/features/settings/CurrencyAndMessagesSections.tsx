import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_MESSAGES,
  formatExchangeRate,
  MESSAGE_SETTING_KEYS,
  MESSAGE_VARIABLES,
  NOTIFICATION_EVENTS,
  NOTIFICATION_LABELS,
  type Settings,
} from '@sipnato/shared';
import { exchangeRateApi } from '../pos/exchange-rate-api';
import { FieldLabel, Section, inputClass, textareaClass } from './ui';

type Patch = (changes: Partial<Settings>) => void;

export function ExchangeRateSection({ current, patch }: { current: Settings; patch: Patch }) {
  const { data: info } = useQuery({ queryKey: ['exchange-rate'], queryFn: exchangeRateApi.get, staleTime: 60_000 });

  return (
    <Section
      title="Tipo de cambio"
      description="Para cobrar en dólares. Se usa el tipo de compra del BCCR, que se actualiza solo cada día."
    >
      <div className="rounded-lg border border-border bg-surface-bg px-4 py-3 text-sm">
        {info?.source === 'bccr' ? (
          <p className="text-text-primary">
            BCCR del {info.date}: compra <strong className="tabular-nums">{formatExchangeRate(info.bccrBuy!)}</strong>
            {' · '}venta <span className="tabular-nums">{formatExchangeRate(info.bccrSell!)}</span>
          </p>
        ) : info?.source === 'manual' ? (
          <p className="text-text-primary">
            Sin dato reciente del BCCR. Se está usando el tipo de respaldo:{' '}
            <strong className="tabular-nums">{formatExchangeRate(info.rate!)}</strong>
          </p>
        ) : (
          <p className="text-brand-warning">
            Sin tipo de cambio del BCCR ni de respaldo: el cobro en dólares está desactivado.
          </p>
        )}
      </div>

      <div>
        <FieldLabel htmlFor="usd_manual_rate">Tipo de cambio de respaldo (₡ por dólar)</FieldLabel>
        <input
          id="usd_manual_rate"
          inputMode="decimal"
          value={current.usd_manual_rate}
          onChange={(e) => patch({ usd_manual_rate: e.target.value.replace(/[^\d.,]/g, '') })}
          placeholder="505.00"
          className={`${inputClass} max-w-40 tabular-nums`}
        />
        <p className="mt-1.5 text-xs text-text-muted">
          Solo se usa si el BCCR no tiene un dato de los últimos días. Déjalo vacío para no cobrar en dólares en ese caso.
        </p>
      </div>
    </Section>
  );
}

export function MessagesSection({ current, patch }: { current: Settings; patch: Patch }) {
  return (
    <Section
      title="Mensajes a clientes"
      description="Textos que se abren en WhatsApp al avisar a un cliente. Quien atiende revisa y toca Enviar."
    >
      {NOTIFICATION_EVENTS.map((event) => {
        const key = MESSAGE_SETTING_KEYS[event];
        const value = current[key];
        return (
          <div key={event}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <FieldLabel htmlFor={key}>{NOTIFICATION_LABELS[event]}</FieldLabel>
              {value && (
                <button
                  type="button"
                  onClick={() => patch({ [key]: '' })}
                  className="text-xs text-text-muted hover:text-brand-blue"
                >
                  Usar texto por defecto
                </button>
              )}
            </div>
            <textarea
              id={key}
              rows={3}
              maxLength={1000}
              value={value || DEFAULT_MESSAGES[event]}
              onChange={(e) => patch({ [key]: e.target.value === DEFAULT_MESSAGES[event] ? '' : e.target.value })}
              className={textareaClass}
            />
            <p className="mt-1 text-xs text-text-muted">
              Datos disponibles: {MESSAGE_VARIABLES[event].map((v) => `{${v}}`).join(' ')}
            </p>
          </div>
        );
      })}
    </Section>
  );
}
