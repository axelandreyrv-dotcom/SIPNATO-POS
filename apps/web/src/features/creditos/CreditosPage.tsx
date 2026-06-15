import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Loader2,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { formatColones } from '@sipnato/shared';
import type { Credito, CreditoWithPayments } from '@sipnato/shared';
import { creditosApi } from './api';
import { fmtDate, fmtDateTime } from '../../lib/format';

// ── helpers ──────────────────────────────────────────────────────────────────

function isOverdue(credito: Credito): boolean {
  if (credito.status !== 'activo') return false;
  return new Date(credito.dueDate) < new Date(new Date().toDateString());
}

function statusLabel(credito: Credito): { text: string; cls: string } {
  if (credito.status === 'pagado') return { text: 'Pagado', cls: 'bg-brand-success/10 text-brand-success' };
  if (credito.status === 'cancelado') return { text: 'Cancelado', cls: 'bg-border text-text-muted' };
  if (isOverdue(credito)) return { text: 'Vencido', cls: 'bg-brand-error/10 text-brand-error' };
  return { text: 'Activo', cls: 'bg-brand-blue/10 text-brand-blue' };
}

// ── CreateModal ───────────────────────────────────────────────────────────────

function CreateModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    debtorName: '',
    debtorPhone: '',
    description: '',
    totalAmount: '',
    dueDate: '',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      creditosApi.create({
        debtorName: form.debtorName.trim(),
        debtorPhone: form.debtorPhone.trim(),
        description: form.description.trim(),
        totalAmount: Math.round(Number(form.totalAmount)),
        dueDate: form.dueDate,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creditos'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const inputClass =
    'h-9 w-full rounded-lg border border-border bg-surface-input px-3 text-sm text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20 placeholder:text-text-muted';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.debtorName.trim()) return setError('Nombre del deudor requerido');
    if (!form.debtorPhone.trim()) return setError('Teléfono requerido');
    if (!form.description.trim()) return setError('Descripción requerida');
    const amount = Number(form.totalAmount);
    if (!amount || amount <= 0) return setError('Monto inválido');
    if (!form.dueDate) return setError('Fecha de vencimiento requerida');
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-text-primary">Nuevo crédito</h2>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover">
            <X size={15} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Nombre del deudor</label>
            <input className={inputClass} placeholder="Juan Pérez" value={form.debtorName}
              onChange={(e) => setForm((f) => ({ ...f, debtorName: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Teléfono</label>
            <input className={inputClass} placeholder="8888-8888" value={form.debtorPhone}
              onChange={(e) => setForm((f) => ({ ...f, debtorPhone: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Descripción</label>
            <input className={inputClass} placeholder="Reparación de pantalla…" value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Monto total (₡)</label>
            <input className={inputClass} type="number" min="1" placeholder="0" value={form.totalAmount}
              onChange={(e) => setForm((f) => ({ ...f, totalAmount: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Fecha de vencimiento</label>
            <input className={inputClass} type="date" value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-xs text-brand-error">
              <AlertCircle size={13} strokeWidth={1.5} aria-hidden /> {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="h-9 flex-1 rounded-lg border border-border text-sm text-text-secondary transition-all hover:bg-surface-hover">
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-blue text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60">
              {mutation.isPending ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" aria-hidden /> : null}
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── PaymentModal ──────────────────────────────────────────────────────────────

function PaymentModal({ credito, onClose }: { credito: Credito; onClose: () => void }) {
  const queryClient = useQueryClient();
  const pending = credito.totalAmount - credito.paidAmount;
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      creditosApi.addPayment(credito.id, {
        amount: Math.round(Number(amount)),
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creditos'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const inputClass =
    'h-9 w-full rounded-lg border border-border bg-surface-input px-3 text-sm text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20 placeholder:text-text-muted';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const val = Math.round(Number(amount));
    if (!val || val <= 0) return setError('Monto inválido');
    if (val > pending) return setError(`El abono no puede superar el saldo pendiente (${formatColones(pending)})`);
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-text-primary">Registrar abono</h2>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover">
            <X size={15} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="rounded-lg bg-surface-input p-3 text-sm">
            <p className="text-text-secondary">{credito.debtorName}</p>
            <p className="mt-0.5 text-text-muted text-xs">{credito.description}</p>
            <div className="mt-2 flex justify-between">
              <span className="text-text-muted text-xs">Saldo pendiente</span>
              <span className="font-semibold text-brand-error">{formatColones(pending)}</span>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Monto del abono (₡)</label>
            <input className={inputClass} type="number" min="1" max={pending} placeholder="0"
              value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Nota (opcional)</label>
            <input className={inputClass} placeholder="Pago parcial…" value={note}
              onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-brand-error">
              <AlertCircle size={13} strokeWidth={1.5} aria-hidden /> {error}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="h-9 flex-1 rounded-lg border border-border text-sm text-text-secondary transition-all hover:bg-surface-hover">
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-blue text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60">
              {mutation.isPending ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" aria-hidden /> : null}
              Registrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CreditoRow ────────────────────────────────────────────────────────────────

function CreditoRow({
  credito,
  onAbono,
}: {
  credito: Credito;
  onAbono: (c: Credito) => void;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<CreditoWithPayments | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const cancelMutation = useMutation({
    mutationFn: () => creditosApi.cancel(credito.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creditos'] });
      setConfirmCancel(false);
    },
  });

  async function handleExpand() {
    if (!expanded && !detail) {
      setLoadingDetail(true);
      try {
        const d = await creditosApi.get(credito.id);
        setDetail(d);
      } finally {
        setLoadingDetail(false);
      }
    }
    setExpanded((v) => !v);
  }

  const pct = credito.totalAmount > 0 ? Math.min(100, Math.round((credito.paidAmount / credito.totalAmount) * 100)) : 0;
  const pending = credito.totalAmount - credito.paidAmount;
  const { text: stText, cls: stCls } = statusLabel(credito);
  const overdue = isOverdue(credito);

  return (
    <div className={`rounded-xl border transition-all ${overdue ? 'border-brand-error/30 bg-brand-error/5' : 'border-border bg-surface-card'}`}>
      {/* Row header */}
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={handleExpand}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary">#{String(credito.consecutive).padStart(4, '0')}</span>
            <span className="text-sm text-text-primary truncate">{credito.debtorName}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${stCls}`}>{stText}</span>
          </div>
          <p className="mt-0.5 text-xs text-text-muted truncate">{credito.description}</p>
          <div className="mt-1.5 flex items-center gap-3 flex-wrap">
            <span className="text-xs text-text-muted">Vence: {fmtDate(credito.dueDate)}</span>
            <span className="text-xs text-text-muted">{credito.debtorPhone}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-semibold text-text-primary">{formatColones(credito.totalAmount)}</span>
          <span className="text-xs text-text-muted">{pct}% pagado</span>
        </div>
        <div className="shrink-0 text-text-muted">
          {loadingDetail ? (
            <Loader2 size={15} strokeWidth={1.5} className="animate-spin" aria-hidden />
          ) : expanded ? (
            <ChevronUp size={15} strokeWidth={1.5} aria-hidden />
          ) : (
            <ChevronDown size={15} strokeWidth={1.5} aria-hidden />
          )}
        </div>
      </button>

      {/* Progress bar */}
      <div className="mx-4 mb-3 h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: credito.status === 'pagado' ? 'var(--color-brand-success)' : overdue ? 'var(--color-brand-error)' : 'var(--color-brand-blue)',
          }}
        />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {/* Amounts */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-surface-input p-2">
              <p className="text-xs text-text-muted">Total</p>
              <p className="text-sm font-semibold text-text-primary">{formatColones(credito.totalAmount)}</p>
            </div>
            <div className="rounded-lg bg-surface-input p-2">
              <p className="text-xs text-text-muted">Abonado</p>
              <p className="text-sm font-semibold text-brand-success">{formatColones(credito.paidAmount)}</p>
            </div>
            <div className="rounded-lg bg-surface-input p-2">
              <p className="text-xs text-text-muted">Pendiente</p>
              <p className={`text-sm font-semibold ${pending > 0 ? 'text-brand-error' : 'text-text-muted'}`}>{formatColones(pending)}</p>
            </div>
          </div>

          {/* Payment history */}
          {detail && detail.payments.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-text-secondary">Historial de abonos</p>
              <div className="space-y-1.5">
                {detail.payments.map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-2 text-xs">
                    <div>
                      <span className="text-text-muted">{fmtDateTime(p.createdAt)}</span>
                      {p.note && <span className="ml-2 text-text-muted">— {p.note}</span>}
                    </div>
                    <span className="font-medium text-brand-success shrink-0">{formatColones(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {detail && detail.payments.length === 0 && (
            <p className="text-xs text-text-muted">Sin abonos registrados</p>
          )}

          {/* Actions */}
          {credito.status === 'activo' && (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => onAbono(credito)}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-blue text-xs font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
              >
                <Plus size={13} strokeWidth={1.5} aria-hidden />
                Abonar
              </button>
              {!confirmCancel ? (
                <button
                  type="button"
                  onClick={() => setConfirmCancel(true)}
                  className="flex h-8 items-center justify-center rounded-lg border border-border px-3 text-xs text-text-muted transition-all hover:border-brand-error hover:text-brand-error"
                >
                  Cancelar crédito
                </button>
              ) : (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                    className="flex h-8 items-center justify-center gap-1 rounded-lg bg-brand-error px-3 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {cancelMutation.isPending && <Loader2 size={11} strokeWidth={1.5} className="animate-spin" aria-hidden />}
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(false)}
                    className="flex h-8 items-center justify-center rounded-lg border border-border px-3 text-xs text-text-muted hover:bg-surface-hover"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── CreditosPage ──────────────────────────────────────────────────────────────

const TABS = [
  { key: 'activo', label: 'Activos' },
  { key: 'pagado', label: 'Pagados' },
  { key: 'cancelado', label: 'Cancelados' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function CreditosPage() {
  const [tab, setTab] = useState<TabKey>('activo');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [abonoTarget, setAbonoTarget] = useState<Credito | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['creditos', tab, search],
    queryFn: () => {
      const params: { status?: string; search?: string } = { status: tab };
      if (search) params.search = search;
      return creditosApi.list(params);
    },
  });

  const creditos = data?.creditos ?? [];

  // Summary for active tab
  const totalPending = tab === 'activo'
    ? creditos.reduce((acc, c) => acc + (c.totalAmount - c.paidAmount), 0)
    : 0;
  const overdueCount = tab === 'activo' ? creditos.filter(isOverdue).length : 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-8">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Ventas a crédito</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            {tab === 'activo' && creditos.length > 0
              ? `${creditos.length} activo${creditos.length !== 1 ? 's' : ''} · ${formatColones(totalPending)} pendiente${overdueCount > 0 ? ` · ${overdueCount} vencido${overdueCount !== 1 ? 's' : ''}` : ''}`
              : 'Gestión de ventas pendientes de cobro'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
        >
          <Plus size={15} strokeWidth={1.5} aria-hidden />
          Nuevo
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl border border-border bg-surface-input p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={[
              'flex-1 rounded-lg py-1.5 text-sm font-medium transition-all',
              tab === t.key
                ? 'bg-surface-card text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
        <input
          type="search"
          placeholder="Buscar por nombre o teléfono…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-border bg-surface-input pl-9 pr-3 text-sm text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20 placeholder:text-text-muted"
        />
      </div>

      {/* List */}
      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-border" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 rounded-xl border border-brand-error/20 bg-brand-error/5 p-4 text-sm text-brand-error">
          <AlertCircle size={15} strokeWidth={1.5} aria-hidden />
          Error al cargar créditos
        </div>
      )}

      {!isLoading && !isError && creditos.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <CreditCard size={32} strokeWidth={1} className="text-text-muted opacity-40" aria-hidden />
          <p className="text-sm text-text-muted">
            {search ? 'Sin resultados para esa búsqueda' : tab === 'activo' ? 'No hay créditos activos' : `No hay créditos ${tab === 'pagado' ? 'pagados' : 'cancelados'}`}
          </p>
          {!search && tab === 'activo' && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-brand-blue px-3 text-xs font-medium text-white transition-all hover:brightness-110"
            >
              <Plus size={13} strokeWidth={1.5} aria-hidden />
              Crear primer crédito
            </button>
          )}
        </div>
      )}

      {!isLoading && !isError && creditos.length > 0 && (
        <div className="space-y-3">
          {creditos.map((c) => (
            <CreditoRow key={c.id} credito={c} onAbono={setAbonoTarget} />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
      {abonoTarget && <PaymentModal credito={abonoTarget} onClose={() => setAbonoTarget(null)} />}
    </div>
  );
}
