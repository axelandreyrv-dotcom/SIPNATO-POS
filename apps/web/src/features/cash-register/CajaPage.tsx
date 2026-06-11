import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Landmark,
  Loader2,
  X,
} from 'lucide-react';
import type { CashRegisterCurrent, CashRegisterSummary } from '@sipnato/shared';
import { formatColones } from '@sipnato/shared';
import { cashRegisterApi } from './api';

const CR_TZ = 'America/Costa_Rica';

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: CR_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: CR_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-surface-input px-3 text-sm text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20 placeholder:text-text-muted';

const btnBase =
  'flex flex-1 h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60';

const btnPrimary = btnBase + ' bg-brand-blue';
const btnDanger  = btnBase + ' bg-brand-error';

const btnSecondary =
  'flex flex-1 h-9 items-center justify-center rounded-lg border border-border text-sm text-text-secondary transition-colors hover:bg-surface-bg';

type TotalsRow = { label: string; value: number; accent?: boolean; negative?: boolean };

function TotalsGrid({ totals }: { totals: CashRegisterCurrent['totals'] }) {
  const rows: TotalsRow[] = [
    { label: 'Efectivo', value: totals.salesEfectivo },
    { label: 'Tarjeta', value: totals.salesTarjeta },
    { label: 'Transferencia', value: totals.salesTransferencia },
    { label: 'SINPE', value: totals.salesSinpe },
    { label: 'Total ventas', value: totals.totalSales, accent: true },
    { label: 'Gastos', value: totals.totalExpenses, negative: true },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {rows.map(({ label, value, accent, negative }) => (
        <div key={label} className="rounded-lg border border-border bg-surface-card p-3">
          <p className="text-xs text-text-muted">{label}</p>
          <p
            className={[
              'mt-1 text-[15px] font-semibold tabular-nums',
              accent ? 'text-brand-blue' : negative ? 'text-brand-error' : 'text-text-primary',
            ].join(' ')}
          >
            {formatColones(value)}
          </p>
        </div>
      ))}
    </div>
  );
}

function NetRow({ amount }: { amount: number }) {
  return (
    <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-surface-bg px-4 py-3">
      <span className="text-sm font-medium text-text-secondary">Balance neto</span>
      <span
        className={[
          'text-base font-semibold tabular-nums',
          amount >= 0 ? 'text-brand-success' : 'text-brand-error',
        ].join(' ')}
      >
        {formatColones(amount)}
      </span>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      <div
        className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-border bg-surface-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <h2 className="text-base font-semibold text-text-primary">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md p-1 text-text-muted transition-colors hover:text-text-primary"
        aria-label="Cerrar"
      >
        <X size={16} />
      </button>
    </div>
  );
}

function OpenModal({
  onClose,
  onConfirm,
  isLoading,
  error,
}: {
  onClose: () => void;
  onConfirm: (amount: number) => void;
  isLoading: boolean;
  error?: string | undefined;
}) {
  const [amount, setAmount] = useState(0);

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Abrir Caja" onClose={onClose} />

      <div className="mb-5">
        <label htmlFor="opening-amount" className="mb-1.5 block text-sm font-medium text-text-secondary">
          Monto inicial en efectivo
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
            ₡
          </span>
          <input
            id="opening-amount"
            type="number"
            min={0}
            step={1}
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value))))}
            className={inputCls + ' pl-7'}
          />
        </div>
        <p className="mt-1 text-xs text-text-muted">Efectivo físico presente al abrir. Puede ser ₡0.</p>
      </div>

      {error && <p className="mb-3 text-xs text-brand-error">{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onClose} className={btnSecondary}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onConfirm(amount)}
          className={btnPrimary}
        >
          {isLoading && <Loader2 size={14} className="animate-spin" />}
          Abrir Caja
        </button>
      </div>
    </Modal>
  );
}

function CloseModal({
  register,
  onClose,
  onConfirm,
  isLoading,
  error,
}: {
  register: CashRegisterCurrent;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  error?: string | undefined;
}) {
  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Cerrar Caja" onClose={onClose} />

      <p className="mb-4 text-sm text-text-muted">Resumen antes de cerrar:</p>
      <TotalsGrid totals={register.totals} />
      <NetRow amount={register.totals.netBalance} />

      {error && <p className="mt-3 text-xs text-brand-error">{error}</p>}

      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onClose} className={btnSecondary}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={onConfirm}
          className={btnDanger}
        >
          {isLoading && <Loader2 size={14} className="animate-spin" />}
          Confirmar cierre
        </button>
      </div>
    </Modal>
  );
}

function HistoryRow({ register }: { register: CashRegisterSummary }) {
  const [expanded, setExpanded] = useState(false);
  const isClosed = register.closedAt !== null;

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-bg"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">
            {fmtDate(register.openedAt)} · {fmtTime(register.openedAt)}
          </p>
          <div className="mt-0.5">
            {isClosed ? (
              <span className="inline-flex items-center rounded-full border border-border bg-surface-bg px-2 py-0.5 text-xs text-text-muted">
                Cerrada{register.closeType === 'auto' ? ' (auto)' : ''}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-brand-success/10 px-2 py-0.5 text-xs font-medium text-brand-success">
                Abierta
              </span>
            )}
          </div>
        </div>
        {register.netBalance !== null && (
          <span
            className={[
              'shrink-0 text-sm font-semibold tabular-nums',
              register.netBalance >= 0 ? 'text-brand-success' : 'text-brand-error',
            ].join(' ')}
          >
            {formatColones(register.netBalance)}
          </span>
        )}
        {expanded ? (
          <ChevronUp size={14} className="shrink-0 text-text-muted" />
        ) : (
          <ChevronDown size={14} className="shrink-0 text-text-muted" />
        )}
      </button>

      {expanded && (
        <div className="space-y-1 border-t border-border bg-surface-bg px-4 py-3 text-xs text-text-muted">
          <p>
            <span className="font-medium text-text-secondary">Apertura:</span>{' '}
            {formatColones(register.openingAmount)}
          </p>
          <p>
            <span className="font-medium text-text-secondary">Abierta:</span>{' '}
            {fmtDate(register.openedAt)} a las {fmtTime(register.openedAt)}
          </p>
          {register.closedAt && (
            <p>
              <span className="font-medium text-text-secondary">Cerrada:</span>{' '}
              {fmtDate(register.closedAt)} a las {fmtTime(register.closedAt)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-14 px-6 text-center">
      <Landmark size={36} strokeWidth={1} className="mb-4 text-text-muted" />
      <p className="text-sm font-medium text-text-primary">No hay caja abierta</p>
      <p className="mt-1 text-xs text-text-muted">
        Abre la caja para registrar ventas y gastos del día.
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-5 flex items-center gap-2 rounded-lg bg-brand-blue px-5 py-2 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
      >
        Abrir Caja
      </button>
    </div>
  );
}

function OpenRegisterCard({
  register,
  onClose,
}: {
  register: CashRegisterCurrent;
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-card p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-success/10 px-2.5 py-1 text-xs font-medium text-brand-success">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-success" />
            Caja abierta
          </div>
          <p className="mt-1.5 text-xs text-text-muted">
            Desde {fmtDate(register.openedAt)} a las {fmtTime(register.openedAt)}
          </p>
          <p className="text-xs text-text-muted">
            Apertura: {formatColones(register.openingAmount)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg border border-brand-error/30 bg-brand-error/5 px-3 py-1.5 text-xs font-medium text-brand-error transition-colors hover:bg-brand-error/10"
        >
          Cerrar Caja
        </button>
      </div>

      <TotalsGrid totals={register.totals} />
      <NetRow amount={register.totals.netBalance} />
    </div>
  );
}

export function CajaPage() {
  const queryClient = useQueryClient();
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);

  const { data: current, isLoading } = useQuery({
    queryKey: ['cash-register', 'current'],
    queryFn: cashRegisterApi.getCurrent,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: history } = useQuery({
    queryKey: ['cash-register', 'list'],
    queryFn: () => cashRegisterApi.list(1),
    staleTime: 30_000,
  });

  const openMutation = useMutation({
    mutationFn: (amount: number) => cashRegisterApi.open({ openingAmount: amount }),
    onSuccess: (data) => {
      queryClient.setQueryData(['cash-register', 'current'], data);
      queryClient.invalidateQueries({ queryKey: ['cash-register', 'list'] });
      setShowOpenModal(false);
    },
  });

  const closeMutation = useMutation({
    mutationFn: cashRegisterApi.close,
    onSuccess: () => {
      queryClient.setQueryData(['cash-register', 'current'], null);
      queryClient.invalidateQueries({ queryKey: ['cash-register', 'list'] });
      setShowCloseModal(false);
    },
  });

  const openError = openMutation.error?.message;
  const closeError = closeMutation.error?.message;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Control de Caja</h1>
        <p className="mt-1 text-sm text-text-muted">
          Apertura, cierre y seguimiento de ventas del día.
        </p>
      </div>

      {/* Status section */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 size={20} strokeWidth={1.5} className="animate-spin text-text-muted" />
        </div>
      ) : current ? (
        <OpenRegisterCard register={current} onClose={() => setShowCloseModal(true)} />
      ) : (
        <EmptyState onOpen={() => setShowOpenModal(true)} />
      )}

      {/* History */}
      {(history?.registers.length ?? 0) > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Historial</h2>
          <div className="overflow-hidden rounded-xl border border-border bg-surface-card">
            {history!.registers.map((r) => (
              <HistoryRow key={r.id} register={r} />
            ))}
          </div>

          {history!.totalPages > 1 && (
            <p className="mt-3 text-center text-xs text-text-muted">
              Página 1 de {history!.totalPages} ·{' '}
              <Link to="/caja" className="text-brand-blue hover:underline">
                Ver todas
              </Link>
            </p>
          )}
        </div>
      )}

      {/* Warning if there are closed registers but none open */}
      {!isLoading && !current && (history?.registers.length ?? 0) > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-brand-warning/20 bg-brand-warning/[0.06] px-4 py-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-brand-warning" />
          <p className="text-xs text-text-secondary">
            Recuerda abrir la caja antes de registrar ventas o gastos del día.
          </p>
        </div>
      )}

      {/* Modals */}
      {showOpenModal && (
        <OpenModal
          onClose={() => setShowOpenModal(false)}
          onConfirm={(amount) => openMutation.mutate(amount)}
          isLoading={openMutation.isPending}
          error={openError}
        />
      )}
      {showCloseModal && current && (
        <CloseModal
          register={current}
          onClose={() => setShowCloseModal(false)}
          onConfirm={() => closeMutation.mutate()}
          isLoading={closeMutation.isPending}
          error={closeError}
        />
      )}
    </div>
  );
}
