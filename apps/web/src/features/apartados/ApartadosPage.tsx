import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Loader2,
  Package,
  Phone,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { formatColones } from '@sipnato/shared';
import type {
  Apartado,
  ApartadoPaymentMethod,
  ApartadoWithPayments,
} from '@sipnato/shared';
import { apartadosApi } from './api';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_METHODS: { value: ApartadoPaymentMethod; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'sinpe', label: 'SINPE' },
];

const STATUS_TABS = [
  { value: 'todos', label: 'Todos' },
  { value: 'activo', label: 'Activos' },
  { value: 'completado', label: 'Completados' },
  { value: 'cancelado', label: 'Cancelados' },
] as const;

// ─── Shared input styles ──────────────────────────────────────────────────────

const inputClass = [
  'h-9 w-full rounded-lg border px-3 text-sm text-text-primary',
  'bg-surface-input outline-none transition-all duration-150',
  'border-border focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20',
  'placeholder:text-text-muted',
].join(' ');

const selectClass = [
  'h-9 w-full rounded-lg border px-3 text-sm text-text-primary',
  'bg-surface-input outline-none transition-all duration-150',
  'border-border focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20',
].join(' ');

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ paid, total }: { paid: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className={[
            'h-full rounded-full transition-all duration-300',
            pct >= 100 ? 'bg-brand-success' : 'bg-brand-blue',
          ].join(' ')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-text-muted shrink-0">{pct}%</span>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Apartado['status'] }) {
  const styles = {
    activo: 'bg-brand-blue/10 text-brand-blue',
    completado: 'bg-brand-success/10 text-brand-success',
    cancelado: 'bg-border text-text-muted',
  };
  const labels = { activo: 'Activo', completado: 'Completado', cancelado: 'Cancelado' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

// ─── Payment row ──────────────────────────────────────────────────────────────

function PaymentRow({ payment }: { payment: ApartadoWithPayments['payments'][number] }) {
  const date = new Date(payment.createdAt).toLocaleDateString('es-CR', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Costa_Rica',
  });
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <div className="flex items-center gap-2 text-text-muted">
        <CircleDollarSign size={13} strokeWidth={1.5} aria-hidden />
        <span>{date}</span>
        <span className="capitalize">{payment.paymentMethod}</span>
        {payment.note && <span className="text-text-muted">— {payment.note}</span>}
      </div>
      <span className="font-medium text-text-primary tabular-nums">{formatColones(payment.amount)}</span>
    </div>
  );
}

// ─── Add payment form ─────────────────────────────────────────────────────────

function AddPaymentForm({ apartadoId, onSuccess }: { apartadoId: number; onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<ApartadoPaymentMethod>('efectivo');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apartadosApi.addPayment(apartadoId, {
        amount: parseInt(amount.replace(/\D/g, ''), 10),
        paymentMethod: method,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['apartados'] });
      void queryClient.invalidateQueries({ queryKey: ['apartado', apartadoId] });
      setAmount('');
      setNote('');
      setError(null);
      onSuccess();
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = parseInt(amount.replace(/\D/g, ''), 10);
    if (!num || num <= 0) { setError('Ingrese un monto válido'); return; }
    setError(null);
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 rounded-lg border border-brand-blue/20 bg-brand-blue/5 p-3 space-y-2">
      <p className="text-xs font-medium text-text-secondary">Agregar abono</p>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          placeholder="Monto ₡"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputClass + ' flex-1'}
        />
        <select value={method} onChange={(e) => setMethod(e.target.value as ApartadoPaymentMethod)} className={selectClass + ' w-36'}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
      <input
        type="text"
        placeholder="Nota (opcional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={200}
        className={inputClass}
      />
      {error && <p className="text-xs text-brand-error">{error}</p>}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="flex h-8 items-center gap-1.5 rounded-lg bg-brand-blue px-3 text-xs font-medium text-white transition-all hover:brightness-110 disabled:opacity-60"
      >
        {mutation.isPending ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" aria-hidden /> : <Plus size={12} strokeWidth={1.5} aria-hidden />}
        Registrar abono
      </button>
    </form>
  );
}

// ─── Apartado row (expandable) ────────────────────────────────────────────────

function ApartadoRow({ ap }: { ap: Apartado }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const { data: detail, isFetching } = useQuery({
    queryKey: ['apartado', ap.id],
    queryFn: () => apartadosApi.get(ap.id),
    enabled: expanded,
    staleTime: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: () => apartadosApi.cancel(ap.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['apartados'] });
      void queryClient.invalidateQueries({ queryKey: ['apartado', ap.id] });
      setConfirmCancel(false);
      setExpanded(false);
    },
  });

  const pending = ap.totalAmount - ap.paidAmount;
  const date = new Date(ap.createdAt).toLocaleDateString('es-CR', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Costa_Rica',
  });

  return (
    <div className="rounded-xl border border-border bg-surface-card transition-shadow duration-150 hover:shadow-sm">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left"
        aria-expanded={expanded}
      >
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10">
          <Package size={16} strokeWidth={1.5} className="text-brand-blue" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="text-xs font-mono text-text-muted">#{ap.consecutive}</span>
            <StatusBadge status={ap.status} />
            <span className="text-xs text-text-muted ml-auto">{date}</span>
          </div>
          <p className="text-sm font-medium text-text-primary truncate">{ap.customerName}</p>
          <p className="text-xs text-text-muted truncate">{ap.description}</p>
          <div className="mt-2 flex items-center gap-3">
            <ProgressBar paid={ap.paidAmount} total={ap.totalAmount} />
            <span className="text-xs tabular-nums text-text-muted whitespace-nowrap">
              {formatColones(ap.paidAmount)} / {formatColones(ap.totalAmount)}
            </span>
          </div>
        </div>
        <div className="ml-2 shrink-0 text-text-muted">
          {expanded
            ? <ChevronUp size={16} strokeWidth={1.5} aria-hidden />
            : <ChevronDown size={16} strokeWidth={1.5} aria-hidden />}
        </div>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <Phone size={11} strokeWidth={1.5} aria-hidden />
              {ap.customerPhone}
            </span>
            {ap.status === 'activo' && (
              <span className="text-brand-warning font-medium">Pendiente: {formatColones(pending)}</span>
            )}
          </div>
          {ap.notes && (
            <p className="mb-3 text-xs text-text-muted italic rounded-lg bg-border/30 px-3 py-2">{ap.notes}</p>
          )}

          {/* Payment history */}
          {isFetching && !detail && (
            <div className="space-y-1.5 mb-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-6 rounded bg-border animate-pulse" />
              ))}
            </div>
          )}
          {detail && detail.payments.length > 0 && (
            <div className="mb-1 divide-y divide-border">
              {detail.payments.map((p) => (
                <PaymentRow key={p.id} payment={p} />
              ))}
            </div>
          )}
          {detail && detail.payments.length === 0 && (
            <p className="text-xs text-text-muted mb-2">Sin abonos registrados aún.</p>
          )}

          {/* Actions */}
          {ap.status === 'activo' && (
            <>
              <AddPaymentForm apartadoId={ap.id} onSuccess={() => {}} />
              <div className="mt-3 flex justify-end">
                {confirmCancel ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">¿Cancelar apartado?</span>
                    <button
                      type="button"
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelMutation.isPending}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-error/10 text-brand-error hover:bg-brand-error/20 transition-colors"
                      aria-label="Confirmar cancelación"
                    >
                      {cancelMutation.isPending
                        ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" aria-hidden />
                        : <X size={13} strokeWidth={1.5} aria-hidden />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmCancel(false)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-muted hover:bg-border/50 transition-colors"
                      aria-label="No cancelar"
                    >
                      <X size={13} strokeWidth={1.5} aria-hidden />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(true)}
                    className="text-xs text-text-muted hover:text-brand-error transition-colors underline-offset-2 hover:underline"
                  >
                    Cancelar apartado
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    description: '',
    totalAmount: '',
    depositAmount: '',
    depositMethod: 'efectivo' as ApartadoPaymentMethod,
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apartadosApi.create({
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        description: form.description.trim(),
        totalAmount: parseInt(form.totalAmount.replace(/\D/g, ''), 10),
        depositAmount: parseInt(form.depositAmount.replace(/\D/g, '') || '0', 10),
        depositMethod: form.depositMethod,
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['apartados'] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerName.trim()) { setError('El nombre es requerido'); return; }
    if (!/^\d{8}$/.test(form.customerPhone.trim())) { setError('El teléfono debe tener 8 dígitos'); return; }
    if (!form.description.trim()) { setError('La descripción es requerida'); return; }
    const total = parseInt(form.totalAmount.replace(/\D/g, ''), 10);
    if (!total || total <= 0) { setError('Ingrese un monto total válido'); return; }
    const deposit = parseInt(form.depositAmount.replace(/\D/g, '') || '0', 10);
    if (deposit < 0) { setError('El depósito no puede ser negativo'); return; }
    setError(null);
    mutation.mutate();
  }

  function patch(changes: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...changes }));
    setError(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal
      aria-label="Nuevo apartado"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-lg rounded-2xl bg-surface-card border border-border shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">Nuevo apartado</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-border/50 transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5" htmlFor="ap-name">
                Nombre del cliente
              </label>
              <input
                id="ap-name"
                type="text"
                placeholder="Juan Pérez"
                value={form.customerName}
                onChange={(e) => patch({ customerName: e.target.value })}
                maxLength={200}
                className={inputClass}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5" htmlFor="ap-phone">
                Teléfono (8 dígitos)
              </label>
              <input
                id="ap-phone"
                type="tel"
                inputMode="numeric"
                placeholder="88888888"
                value={form.customerPhone}
                onChange={(e) => patch({ customerPhone: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5" htmlFor="ap-desc">
              Artículo / descripción
            </label>
            <input
              id="ap-desc"
              type="text"
              placeholder="iPhone 15 Pro Max 256GB — Negro"
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              maxLength={500}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5" htmlFor="ap-total">
                Precio total (₡)
              </label>
              <input
                id="ap-total"
                type="text"
                inputMode="numeric"
                placeholder="150000"
                value={form.totalAmount}
                onChange={(e) => patch({ totalAmount: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5" htmlFor="ap-deposit">
                Depósito inicial (₡)
              </label>
              <input
                id="ap-deposit"
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={form.depositAmount}
                onChange={(e) => patch({ depositAmount: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5" htmlFor="ap-method">
              Método del depósito
            </label>
            <select
              id="ap-method"
              value={form.depositMethod}
              onChange={(e) => patch({ depositMethod: e.target.value as ApartadoPaymentMethod })}
              className={selectClass}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5" htmlFor="ap-notes">
              Notas (opcional)
            </label>
            <textarea
              id="ap-notes"
              rows={2}
              placeholder="Observaciones, condiciones, etc."
              value={form.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              maxLength={2000}
              className={[
                'w-full rounded-lg border px-3 py-2 text-sm text-text-primary resize-none',
                'bg-surface-input outline-none transition-all duration-150',
                'border-border focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20',
                'placeholder:text-text-muted',
              ].join(' ')}
            />
          </div>

          {error && <p className="text-sm text-brand-error">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 items-center rounded-lg border border-border px-4 text-sm text-text-secondary hover:bg-border/50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex h-9 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-60"
            >
              {mutation.isPending
                ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />
                : <Plus size={14} strokeWidth={1.5} aria-hidden />}
              Crear apartado
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ApartadosPage() {
  const [statusFilter, setStatusFilter] = useState<string>('activo');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['apartados', statusFilter, search],
    queryFn: () => apartadosApi.list({
      status: statusFilter,
      ...(search ? { search } : {}),
    }),
    staleTime: 30_000,
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-8 sm:py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Apartados</h1>
          <p className="mt-0.5 text-sm text-text-muted">Layaway y reservas con abonos parciales.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
        >
          <Plus size={15} strokeWidth={1.5} aria-hidden />
          Nuevo
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search size={15} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" aria-hidden />
          <input
            type="search"
            placeholder="Buscar por nombre, teléfono o artículo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputClass + ' pl-9'}
          />
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 rounded-lg border border-border bg-surface-input p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={[
                'flex-1 rounded-md py-1.5 text-xs font-medium transition-all duration-150',
                statusFilter === tab.value
                  ? 'bg-surface-card text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-border bg-surface-card animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-brand-error">No se pudieron cargar los apartados.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-sm text-brand-blue hover:underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {!isLoading && !isError && data?.data.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-border/50">
            <Package size={22} strokeWidth={1.5} className="text-text-muted" aria-hidden />
          </div>
          <p className="text-sm font-medium text-text-primary">
            {search ? 'Sin resultados para esa búsqueda' : 'No hay apartados'}
          </p>
          <p className="text-xs text-text-muted">
            {search ? 'Intenta con otro término.' : 'Crea el primero con el botón "Nuevo".'}
          </p>
        </div>
      )}

      {!isLoading && !isError && data && data.data.length > 0 && (
        <div className="space-y-3">
          {data.data.map((ap) => (
            <ApartadoRow key={ap.id} ap={ap} />
          ))}
          <p className="text-center text-xs text-text-muted pt-2">
            {data.total} {data.total === 1 ? 'apartado' : 'apartados'}
          </p>
        </div>
      )}

      {/* Create modal */}
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
