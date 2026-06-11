import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import type { PaymentMethod, Sale } from '@sipnato/shared';
import { formatColones } from '@sipnato/shared';
import { cashRegisterApi } from '../cash-register/api';
import { salesApi } from './api';

const CR_TZ = 'America/Costa_Rica';

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: CR_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'sinpe', label: 'SINPE' },
  { value: 'transferencia', label: 'Trans.' },
];

const METHOD_COLORS: Record<PaymentMethod, string> = {
  efectivo: 'bg-brand-success/10 text-brand-success',
  tarjeta: 'bg-brand-blue/10 text-brand-blue',
  sinpe: 'bg-brand-warning/10 text-brand-warning',
  transferencia: 'bg-surface-bg text-text-muted border border-border',
};

// ── Toast ─────────────────────────────────────────────────────────────────────
type ToastItem = { id: number; text: string };

function ToastList({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-4 z-50 flex flex-col gap-2 sm:right-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 rounded-lg border border-brand-success/20 bg-surface-card px-4 py-3 shadow-lg"
        >
          <CheckCircle size={16} className="shrink-0 text-brand-success" />
          <span className="text-sm font-medium text-text-primary">{t.text}</span>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="ml-2 text-text-muted hover:text-text-primary"
            aria-label="Cerrar"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Change calculator modal ───────────────────────────────────────────────────
function ChangeCalcModal({
  amount,
  onConfirm,
  onClose,
  isLoading,
}: {
  amount: number;
  onConfirm: () => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  const [received, setReceived] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const receivedAmount = Math.floor(Number(received) || 0);
  const change = receivedAmount - amount;
  const canConfirm = receivedAmount >= amount;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && canConfirm) onConfirm();
    if (e.key === 'Escape') onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      <div
        className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl border border-border bg-surface-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">Calculadora de vuelto</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <div className="mb-5 rounded-lg bg-surface-bg px-4 py-3 text-center">
          <p className="text-xs text-text-muted mb-1">Total a cobrar</p>
          <p className="text-2xl font-semibold tabular-nums text-text-primary">{formatColones(amount)}</p>
        </div>

        <div className="mb-5">
          <label htmlFor="received" className="mb-1.5 block text-sm font-medium text-text-secondary">
            Monto recibido
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">₡</span>
            <input
              id="received"
              ref={inputRef}
              type="number"
              min={0}
              step={1}
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="0"
              className="h-11 w-full rounded-lg border border-border bg-surface-input pl-7 pr-3 text-base text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20"
            />
          </div>
        </div>

        {receivedAmount > 0 && (
          <div className={[
            'mb-5 rounded-lg px-4 py-4 text-center',
            canConfirm ? 'bg-brand-success/[0.08]' : 'bg-brand-error/[0.08]',
          ].join(' ')}>
            <p className="text-xs text-text-muted mb-1">Vuelto</p>
            <p className={[
              'text-3xl font-bold tabular-nums',
              canConfirm ? 'text-brand-success' : 'text-brand-error',
            ].join(' ')}>
              {canConfirm ? formatColones(change) : `−${formatColones(amount - receivedAmount)}`}
            </p>
            {!canConfirm && (
              <p className="mt-1 text-xs text-brand-error">Monto insuficiente</p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex flex-1 h-9 items-center justify-center rounded-lg border border-border text-sm text-text-secondary transition-colors hover:bg-surface-bg">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canConfirm || isLoading}
            onClick={onConfirm}
            className="flex flex-1 h-9 items-center justify-center gap-1.5 rounded-lg bg-brand-success text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading && <Loader2 size={14} className="animate-spin" />}
            Confirmar cobro
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sale row ──────────────────────────────────────────────────────────────────
function SaleRow({
  sale,
  onDelete,
  isDeleting,
}: {
  sale: Sale;
  onDelete: (id: number) => void;
  isDeleting: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-surface-bg/50 transition-colors">
      <span className="w-8 shrink-0 text-xs tabular-nums text-text-muted text-right">
        #{sale.consecutive}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
        {sale.description || <span className="text-text-muted italic">Sin descripción</span>}
      </span>
      <span className={[
        'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
        METHOD_COLORS[sale.paymentMethod],
      ].join(' ')}>
        {METHODS.find(m => m.value === sale.paymentMethod)?.label ?? sale.paymentMethod}
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">
        {formatColones(sale.amount)}
      </span>
      <span className="shrink-0 text-xs text-text-muted w-10 text-right">
        {fmtTime(sale.createdAt)}
      </span>

      {confirming ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => { onDelete(sale.id); setConfirming(false); }}
            disabled={isDeleting}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-brand-error bg-brand-error/10 hover:bg-brand-error/20 transition-colors disabled:opacity-50"
          >
            {isDeleting ? <Loader2 size={11} className="animate-spin" /> : null}
            Eliminar
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded p-1 text-text-muted hover:text-text-primary"
            aria-label="Cancelar"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="shrink-0 rounded p-1.5 text-text-muted transition-colors hover:bg-brand-error/10 hover:text-brand-error"
          aria-label="Eliminar venta"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function POSPage() {
  const queryClient = useQueryClient();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [showChangeCalc, setShowChangeCalc] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const amount = Math.max(0, Math.floor(Number(amountStr) || 0));
  const canSubmit = amount >= 1 && method !== undefined;

  const { data: register } = useQuery({
    queryKey: ['cash-register', 'current'],
    queryFn: cashRegisterApi.getCurrent,
    staleTime: 30_000,
  });

  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['sales', 'list'],
    queryFn: () => salesApi.list(1),
    staleTime: 10_000,
    enabled: register !== undefined,
  });

  function addToast(text: string) {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4_000);
  }

  function resetForm() {
    setDescription('');
    setAmountStr('');
    setMethod('efectivo');
  }

  const createMutation = useMutation({
    mutationFn: salesApi.create,
    onSuccess: (sale) => {
      queryClient.invalidateQueries({ queryKey: ['sales', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register', 'current'] });
      addToast(`Venta #${sale.consecutive} cobrada — ${formatColones(sale.amount)}`);
      resetForm();
      setShowChangeCalc(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => salesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register', 'current'] });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !register) return;

    if (method === 'efectivo') {
      setShowChangeCalc(true);
    } else {
      createMutation.mutate({ description: description || undefined, amount, paymentMethod: method });
    }
  }

  function handleConfirmSale() {
    if (!canSubmit || !register) return;
    createMutation.mutate({ description: description || undefined, amount, paymentMethod: method });
  }

  function handleMethodKey(e: React.KeyboardEvent, value: PaymentMethod) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setMethod(value);
    }
  }

  const noRegister = register === null;
  const totalSales = salesData?.sales.length ?? 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Punto de Venta</h1>
        <p className="mt-1 text-sm text-text-muted">Registra ventas rápidamente.</p>
      </div>

      {/* No register warning */}
      {noRegister && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-brand-warning/25 bg-brand-warning/[0.07] px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-brand-warning" />
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">No hay caja abierta</p>
            <p className="mt-0.5 text-xs text-text-muted">
              Debes abrir la caja antes de registrar ventas.{' '}
              <Link to="/caja" className="font-medium text-brand-blue hover:underline">
                Ir a Caja →
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* POS Form */}
      <form onSubmit={handleSubmit} className="mb-8">
        <fieldset disabled={noRegister || createMutation.isPending} className="space-y-4 disabled:opacity-60">
          {/* Description */}
          <div>
            <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Descripción <span className="font-normal text-text-muted">(opcional)</span>
            </label>
            <input
              id="description"
              type="text"
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Cambio de pantalla, Cargador Samsung..."
              className="h-9 w-full rounded-lg border border-border bg-surface-input px-3 text-sm text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20 placeholder:text-text-muted"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  amountInputRef.current?.focus();
                }
              }}
            />
          </div>

          {/* Amount */}
          <div>
            <label htmlFor="amount" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Monto
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">₡</span>
              <input
                id="amount"
                ref={amountInputRef}
                type="number"
                min={1}
                step={1}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0"
                className="h-11 w-full rounded-lg border border-border bg-surface-input pl-7 pr-3 text-lg font-medium tabular-nums text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20 placeholder:text-text-muted placeholder:font-normal placeholder:text-base"
              />
            </div>
          </div>

          {/* Payment method */}
          <div>
            <p className="mb-2 text-sm font-medium text-text-secondary">Método de pago</p>
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Método de pago">
              {METHODS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={method === value}
                  tabIndex={method === value ? 0 : -1}
                  onClick={() => setMethod(value)}
                  onKeyDown={(e) => handleMethodKey(e, value)}
                  className={[
                    'h-11 rounded-lg border text-sm font-medium transition-all',
                    method === value
                      ? 'border-brand-blue bg-brand-blue text-white shadow-sm'
                      : 'border-border bg-surface-card text-text-secondary hover:border-brand-blue/40 hover:text-text-primary',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit || noRegister || createMutation.isPending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-blue text-base font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <><Loader2 size={18} className="animate-spin" /> Procesando...</>
            ) : (
              amount >= 1 ? `Cobrar ${formatColones(amount)}` : 'Cobrar'
            )}
          </button>

          {createMutation.isError && (
            <p className="text-center text-xs text-brand-error">
              {createMutation.error?.message ?? 'Error al registrar la venta'}
            </p>
          )}
        </fieldset>
      </form>

      {/* Sales list */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            Ventas de la caja
            {totalSales > 0 && (
              <span className="ml-2 text-xs font-normal text-text-muted">({totalSales})</span>
            )}
          </h2>
          {salesData && salesData.total > 0 && (
            <span className="text-xs text-text-muted">
              Total: <span className="font-medium text-text-primary tabular-nums">
                {formatColones(salesData.sales.reduce((sum, s) => sum + s.amount, 0))}
              </span>
            </span>
          )}
        </div>

        {salesLoading ? (
          <div className="flex h-20 items-center justify-center">
            <Loader2 size={18} strokeWidth={1.5} className="animate-spin text-text-muted" />
          </div>
        ) : !salesData?.sales.length ? (
          <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-border">
            <p className="text-sm text-text-muted">
              {noRegister ? 'Abre la caja para ver las ventas' : 'Sin ventas registradas aún'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface-card">
            {salesData.sales.map((sale) => (
              <SaleRow
                key={sale.id}
                sale={sale}
                onDelete={(id) => deleteMutation.mutate(id)}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === sale.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Change calculator modal */}
      {showChangeCalc && register && (
        <ChangeCalcModal
          amount={amount}
          onConfirm={handleConfirmSale}
          onClose={() => setShowChangeCalc(false)}
          isLoading={createMutation.isPending}
        />
      )}

      {/* Toasts */}
      <ToastList toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
