import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react';
import { formatColones } from '@sipnato/shared';
import type { Expense } from '@sipnato/shared';
import { cashRegisterApi } from '../cash-register/api';
import { salesApi } from '../pos/api';
import { expensesApi } from './api';

const CR_TZ = 'America/Costa_Rica';

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: CR_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

// ── Expense row ───────────────────────────────────────────────────────────────
function ExpenseRow({
  expense,
  onDelete,
  isDeleting,
}: {
  expense: Expense;
  onDelete: (id: number) => void;
  isDeleting: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0 hover:bg-surface-bg/50 transition-colors">
      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{expense.description}</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-brand-error">
        −{formatColones(expense.amount)}
      </span>
      <span className="shrink-0 w-10 text-right text-xs text-text-muted">{fmtTime(expense.createdAt)}</span>

      {confirming ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => { onDelete(expense.id); setConfirming(false); }}
            disabled={isDeleting}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-brand-error bg-brand-error/10 hover:bg-brand-error/20 transition-colors disabled:opacity-50"
          >
            {isDeleting && <Loader2 size={11} className="animate-spin" />}
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
          aria-label="Eliminar gasto"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

// ── Balance card ──────────────────────────────────────────────────────────────
function BalanceCard({
  label,
  amount,
  variant,
}: {
  label: string;
  amount: number;
  variant: 'income' | 'expense' | 'balance';
}) {
  const styles = {
    income: {
      bg: 'bg-brand-success/[0.07] border-brand-success/20',
      text: 'text-brand-success',
      icon: <TrendingUp size={16} className="text-brand-success" />,
    },
    expense: {
      bg: 'bg-brand-error/[0.07] border-brand-error/20',
      text: 'text-brand-error',
      icon: <TrendingDown size={16} className="text-brand-error" />,
    },
    balance: {
      bg: amount >= 0 ? 'bg-brand-success/[0.07] border-brand-success/20' : 'bg-brand-error/[0.07] border-brand-error/20',
      text: amount >= 0 ? 'text-brand-success' : 'text-brand-error',
      icon: amount >= 0
        ? <TrendingUp size={16} className="text-brand-success" />
        : <TrendingDown size={16} className="text-brand-error" />,
    },
  };

  const s = styles[variant];

  return (
    <div className={`flex flex-col gap-1 rounded-xl border p-4 ${s.bg}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">{label}</span>
        {s.icon}
      </div>
      <span className={`text-lg font-semibold tabular-nums ${s.text}`}>
        {variant === 'expense' ? '−' : ''}{formatColones(Math.abs(amount))}
      </span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ExpensesPage() {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);

  const amount = Math.max(0, Math.floor(Number(amountStr) || 0));
  const canSubmit = description.trim().length > 0 && amount >= 1;

  const { data: register } = useQuery({
    queryKey: ['cash-register', 'current'],
    queryFn: cashRegisterApi.getCurrent,
    staleTime: 30_000,
  });

  const { data: expensesData, isLoading: expensesLoading } = useQuery({
    queryKey: ['expenses', 'list'],
    queryFn: expensesApi.list,
    staleTime: 10_000,
    enabled: register !== undefined,
  });

  const { data: salesData } = useQuery({
    queryKey: ['sales', 'list'],
    queryFn: () => salesApi.list(1),
    staleTime: 10_000,
    enabled: register !== undefined,
  });

  const createMutation = useMutation({
    mutationFn: expensesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register', 'current'] });
      setDescription('');
      setAmountStr('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => expensesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register', 'current'] });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !register) return;
    createMutation.mutate({ description: description.trim(), amount });
  }

  const noRegister = register === null;

  const totalIncome = salesData?.sales.reduce((s, v) => s + v.amount, 0) ?? 0;
  const totalExpenses = expensesData?.total ?? 0;
  const netBalance = totalIncome - totalExpenses;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Gastos</h1>
        <p className="mt-1 text-sm text-text-muted">Registra los egresos de la caja.</p>
      </div>

      {/* No register warning */}
      {noRegister && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-brand-warning/25 bg-brand-warning/[0.07] px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-brand-warning" />
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">No hay caja abierta</p>
            <p className="mt-0.5 text-xs text-text-muted">
              Debes abrir la caja antes de registrar gastos.{' '}
              <Link to="/caja" className="font-medium text-brand-blue hover:underline">
                Ir a Caja →
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Balance cards */}
      {register && (
        <div className="mb-8 grid grid-cols-3 gap-3">
          <BalanceCard label="Ingresos" amount={totalIncome} variant="income" />
          <BalanceCard label="Gastos" amount={totalExpenses} variant="expense" />
          <BalanceCard label="Balance neto" amount={netBalance} variant="balance" />
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="mb-8">
        <fieldset disabled={noRegister || createMutation.isPending} className="space-y-4 disabled:opacity-60">
          <div>
            <label htmlFor="exp-description" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Descripción
            </label>
            <input
              id="exp-description"
              type="text"
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Compra de insumos, pago de servicio..."
              className="h-9 w-full rounded-lg border border-border bg-surface-input px-3 text-sm text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20 placeholder:text-text-muted"
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); amountRef.current?.focus(); }
              }}
            />
          </div>

          <div>
            <label htmlFor="exp-amount" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Monto
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">₡</span>
              <input
                id="exp-amount"
                ref={amountRef}
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

          <button
            type="submit"
            disabled={!canSubmit || noRegister || createMutation.isPending}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-error text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <><Loader2 size={16} className="animate-spin" /> Registrando...</>
            ) : (
              amount >= 1 ? `Registrar gasto ${formatColones(amount)}` : 'Registrar gasto'
            )}
          </button>

          {createMutation.isError && (
            <p className="text-center text-xs text-brand-error">
              {createMutation.error?.message ?? 'Error al registrar el gasto'}
            </p>
          )}
        </fieldset>
      </form>

      {/* Expenses list */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            Gastos de la caja
            {(expensesData?.expenses.length ?? 0) > 0 && (
              <span className="ml-2 text-xs font-normal text-text-muted">
                ({expensesData?.expenses.length})
              </span>
            )}
          </h2>
          {(expensesData?.total ?? 0) > 0 && (
            <span className="text-xs text-text-muted">
              Total: <span className="font-medium text-brand-error tabular-nums">
                −{formatColones(expensesData?.total ?? 0)}
              </span>
            </span>
          )}
        </div>

        {expensesLoading ? (
          <div className="flex h-20 items-center justify-center">
            <Loader2 size={18} strokeWidth={1.5} className="animate-spin text-text-muted" />
          </div>
        ) : !expensesData?.expenses.length ? (
          <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-border">
            <p className="text-sm text-text-muted">
              {noRegister ? 'Abre la caja para ver los gastos' : 'Sin gastos registrados aún'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface-card">
            {expensesData.expenses.map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                onDelete={(id) => deleteMutation.mutate(id)}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === expense.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
