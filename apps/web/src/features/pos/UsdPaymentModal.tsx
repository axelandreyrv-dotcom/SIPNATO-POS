import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  formatColones,
  formatExchangeRate,
  formatUsd,
  parseUsdToCents,
  usdCentsToColones,
  type ExchangeRateInfo,
} from '@sipnato/shared';

// Cobro con dólares en efectivo. La cuenta es en colones: se muestra el equivalente de
// lo recibido y el vuelto en colones. El servidor recalcula con su tipo de cambio.
export function UsdPaymentModal({
  amount,
  rateInfo,
  onConfirm,
  onClose,
  isLoading,
  error,
}: {
  amount: number;
  rateInfo: ExchangeRateInfo | undefined;
  onConfirm: (usdReceivedCents: number) => void;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [received, setReceived] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const rate = rateInfo?.rate ?? null;
  const cents = parseUsdToCents(received);
  const equivalent = rate !== null && cents !== null ? usdCentsToColones(cents, rate) : null;
  const change = equivalent !== null ? equivalent - amount : null;
  const canConfirm = change !== null && change >= 0;
  // Dólares mínimos para cubrir el total (redondeo hacia arriba al centavo).
  const minCents = rate !== null ? Math.ceil((amount * 10_000) / rate) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="usd-title"
        className="relative w-full rounded-t-2xl border border-border bg-surface-card p-6 shadow-[0_8px_32px_-4px_oklch(0%_0_0/0.18)] sm:max-w-sm sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter' && canConfirm && !isLoading) onConfirm(cents!);
        }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="usd-title" className="text-base font-semibold text-text-primary">Cobro en dólares</h2>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-bg hover:text-text-primary" aria-label="Cerrar">
            <X size={16} strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        {rate === null ? (
          <p className="rounded-lg bg-brand-warning/[0.08] px-4 py-3 text-sm text-text-primary" role="alert">
            No hay tipo de cambio disponible. El dueño puede configurar uno de respaldo en Configuración.
          </p>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border text-center">
              <div className="bg-surface-bg px-3 py-3">
                <p className="mb-1 text-xs text-text-muted">Total</p>
                <p className="text-xl font-semibold tabular-nums text-text-primary">{formatColones(amount)}</p>
                {minCents !== null && <p className="mt-0.5 text-xs tabular-nums text-text-muted">≈ {formatUsd(minCents)}</p>}
              </div>
              <div className="bg-surface-bg px-3 py-3">
                <p className="mb-1 text-xs text-text-muted">Tipo de cambio</p>
                <p className="text-xl font-semibold tabular-nums text-text-primary">{formatExchangeRate(rate)}</p>
                <p className="mt-0.5 text-xs text-text-muted">{rateInfo?.source === 'bccr' ? 'compra BCCR' : 'de respaldo'}</p>
              </div>
            </div>

            <label htmlFor="usd-received" className="mb-1.5 block text-sm font-medium text-text-secondary">Dólares recibidos</label>
            <div className="relative mb-5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">$</span>
              <input
                id="usd-received"
                ref={inputRef}
                inputMode="decimal"
                value={received}
                onChange={(e) => setReceived(e.target.value.replace(/[^\d.,]/g, ''))}
                placeholder="20"
                className="h-11 w-full rounded-lg border border-border bg-surface-input pl-7 pr-3 text-base tabular-nums text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20"
              />
            </div>

            {equivalent !== null && (
              <div className={['mb-5 rounded-lg px-4 py-4 text-center', canConfirm ? 'bg-brand-success/[0.08]' : 'bg-brand-error/[0.08]'].join(' ')}>
                <p className="mb-1 text-xs text-text-muted">Equivale a {formatColones(equivalent)} · Vuelto en colones</p>
                <p className={['text-3xl font-bold tabular-nums', canConfirm ? 'text-brand-success' : 'text-brand-error'].join(' ')}>
                  {canConfirm ? formatColones(change!) : `−${formatColones(-change!)}`}
                </p>
                {!canConfirm && <p className="mt-1 text-xs text-brand-error" role="alert">No alcanza para el total</p>}
              </div>
            )}
          </>
        )}

        {error && <p className="mb-3 text-sm text-brand-error" role="alert">{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex h-10 flex-1 items-center justify-center rounded-lg border border-border text-sm text-text-secondary hover:bg-surface-bg">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canConfirm || isLoading}
            onClick={() => onConfirm(cents!)}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-success text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />}
            Confirmar cobro
          </button>
        </div>
      </div>
    </div>
  );
}
