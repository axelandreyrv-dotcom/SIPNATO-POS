import { useState } from 'react';
import { createRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingDown,
} from 'lucide-react';
import { formatColones } from '@sipnato/shared';
import type {
  DashboardData,
  DashboardMovement,
  DashboardWeeklyEntry,
  PaymentMethod,
} from '@sipnato/shared';
import { fmtTime } from '../../lib/format';
import { dashboardApi } from '../../features/dashboard/api';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/',
  component: DashboardPage,
});

// ── CR date helpers ──────────────────────────────────────────────────────────

function todayCR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date());
}

const longDateFmt = new Intl.DateTimeFormat('es-CR', {
  timeZone: 'America/Costa_Rica',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function weekdayShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return new Intl.DateTimeFormat('es-CR', { weekday: 'short' }).format(dt).replace('.', '');
}

const PM_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  sinpe: 'SINPE',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
};

const PM_ORDER: PaymentMethod[] = ['efectivo', 'sinpe', 'tarjeta', 'transferencia'];

// ── Header: title + caja status ──────────────────────────────────────────────

function CajaPill({ data }: { data: DashboardData }) {
  const { isOpen, openedAt } = data.cashRegister;

  if (isOpen && openedAt) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-card px-3 py-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-brand-success" aria-hidden />
        <span className="text-sm text-text-primary">Caja abierta · {fmtTime(openedAt)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-card px-3 py-1.5">
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-brand-warning" aria-hidden />
        <span className="text-sm text-text-muted">Caja cerrada</span>
      </span>
      <Link
        to="/caja"
        viewTransition
        className="text-sm font-medium text-brand-blue hover:underline focus-visible:underline"
      >
        Abrir →
      </Link>
    </div>
  );
}

// ── KPI strip ─────────────────────────────────────────────────────────────────

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-xs text-text-muted">sin ventas ayer</span>;
  }
  const rounded = Math.round(pct);
  if (rounded === 0) {
    return <span className="text-xs text-text-muted">igual que ayer</span>;
  }
  const up = rounded > 0;
  return (
    <span
      className={`flex items-center gap-0.5 text-xs font-medium ${up ? 'text-brand-success' : 'text-brand-error'}`}
    >
      {up ? (
        <ArrowUpRight size={13} strokeWidth={1.5} aria-hidden />
      ) : (
        <ArrowDownRight size={13} strokeWidth={1.5} aria-hidden />
      )}
      {Math.abs(rounded)}% vs ayer
    </span>
  );
}

function KpiStrip({ data }: { data: DashboardData }) {
  const { totalSales, totalExpenses, netBalance, boletasCount, salesDeltaPct } = data.today;
  const balanceColor =
    netBalance > 0 ? 'text-brand-success' : netBalance < 0 ? 'text-brand-error' : 'text-text-primary';

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
      <div className="bg-surface-card px-4 py-4">
        <p className="text-xs text-text-muted">Ventas hoy</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
          {formatColones(totalSales)}
        </p>
        <div className="mt-1">
          <DeltaBadge pct={salesDeltaPct} />
        </div>
      </div>

      <div className="bg-surface-card px-4 py-4">
        <p className="text-xs text-text-muted">Gastos hoy</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
          {formatColones(totalExpenses)}
        </p>
        <p className="mt-1 text-xs text-text-muted">egresos de caja</p>
      </div>

      <div className="bg-surface-card px-4 py-4">
        <p className="text-xs text-text-muted">Balance del día</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${balanceColor}`}>
          {netBalance < 0 ? '−' : ''}
          {formatColones(Math.abs(netBalance))}
        </p>
        <p className="mt-1 text-xs text-text-muted">ingresos − gastos</p>
      </div>

      <div className="bg-surface-card px-4 py-4">
        <p className="text-xs text-text-muted">Boletas hoy</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{boletasCount}</p>
        <p className="mt-1 text-xs text-text-muted">equipos ingresados</p>
      </div>
    </div>
  );
}

// ── Weekly chart ──────────────────────────────────────────────────────────────

function WeeklyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: DashboardWeeklyEntry }>;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const total = entry?.value ?? 0;
  const count = entry?.payload?.count ?? 0;
  const date = entry?.payload?.date;
  return (
    <div className="rounded-lg border border-border bg-surface-card px-3 py-2 shadow-md">
      {date && <p className="text-xs capitalize text-text-muted">{weekdayShort(date)}</p>}
      <p className="text-sm font-semibold tabular-nums text-text-primary">{formatColones(total)}</p>
      <p className="text-xs text-text-muted">
        {count} {count === 1 ? 'venta' : 'ventas'}
      </p>
    </div>
  );
}

function WeeklyChart({ weekly }: { weekly: DashboardWeeklyEntry[] }) {
  const today = todayCR();
  const hasData = weekly.some((d) => d.total > 0);

  return (
    <section
      aria-label="Ventas de los últimos 7 días"
      className="rounded-xl border border-border bg-surface-card p-4"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Últimos 7 días</h2>
        <span className="text-xs text-text-muted">ventas</span>
      </div>
      {!hasData ? (
        <div className="flex h-[180px] items-center justify-center">
          <p className="text-sm text-text-muted">Sin ventas en la semana.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={weekly} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => (d === today ? 'Hoy' : weekdayShort(d))}
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) =>
                v >= 1_000_000
                  ? `₡${(v / 1_000_000).toFixed(1)}M`
                  : v >= 1000
                    ? `₡${Math.round(v / 1000)}k`
                    : `₡${v}`
              }
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip content={<WeeklyTooltip />} cursor={{ fill: 'transparent' }} />
            <Bar dataKey="total" radius={[3, 3, 0, 0]}>
              {weekly.map((d) => (
                <Cell
                  key={d.date}
                  fill="var(--color-brand-blue)"
                  fillOpacity={d.date === today ? 1 : 0.32}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}

// ── Payment methods ───────────────────────────────────────────────────────────

function PaymentMethods({ data }: { data: DashboardData }) {
  const { byPaymentMethod } = data.today;
  const total = PM_ORDER.reduce((sum, m) => sum + byPaymentMethod[m], 0);

  return (
    <section
      aria-label="Métodos de pago de hoy"
      className="rounded-xl border border-border bg-surface-card p-4"
    >
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Métodos de pago</h2>
      <div className="flex flex-col gap-3">
        {PM_ORDER.map((method) => {
          const value = byPaymentMethod[method];
          const pct = total > 0 ? (value / total) * 100 : 0;
          return (
            <div key={method}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="text-text-secondary">{PM_LABEL[method]}</span>
                <span className="tabular-nums text-text-primary">{formatColones(value)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-bg">
                <div
                  className="h-full rounded-full bg-brand-blue transition-[width] duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {total === 0 && <p className="mt-3 text-xs text-text-muted">Aún no hay cobros hoy.</p>}
    </section>
  );
}

// ── Recent movements ──────────────────────────────────────────────────────────

type MovementTab = 'todo' | 'sale' | 'expense';

const TABS: { key: MovementTab; label: string }[] = [
  { key: 'todo', label: 'Todo' },
  { key: 'sale', label: 'Ventas' },
  { key: 'expense', label: 'Gastos' },
];

function MovementRow({ mv }: { mv: DashboardMovement }) {
  const isSale = mv.type === 'sale';
  const Icon = isSale ? ShoppingCart : TrendingDown;
  const label = mv.description?.trim()
    ? mv.description
    : isSale
      ? 'Venta sin descripción'
      : 'Gasto';
  const sub = isSale && mv.paymentMethod ? PM_LABEL[mv.paymentMethod] : 'Gasto';

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          isSale ? 'bg-brand-success/10 text-brand-success' : 'bg-brand-error/10 text-brand-error'
        }`}
      >
        <Icon size={16} strokeWidth={1.5} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-primary" title={label}>
          {label}
        </p>
        <p className="text-xs text-text-muted">
          {fmtTime(mv.createdAt)} · {sub}
        </p>
      </div>
      <span
        className={`shrink-0 text-sm font-medium tabular-nums ${
          isSale ? 'text-brand-success' : 'text-brand-error'
        }`}
      >
        {isSale ? '+' : '−'}
        {formatColones(mv.amount)}
      </span>
    </li>
  );
}

function RecentMovements({ data }: { data: DashboardData }) {
  const [tab, setTab] = useState<MovementTab>('todo');
  const movements = data.recentMovements.filter((m) => tab === 'todo' || m.type === tab);

  return (
    <section
      aria-label="Movimientos recientes"
      className="flex flex-col rounded-xl border border-border bg-surface-card p-4"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Movimientos recientes</h2>
        <div className="flex gap-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === key
                  ? 'bg-surface-bg text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {movements.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8">
          <p className="text-sm text-text-muted">
            {tab === 'expense' ? 'Sin gastos recientes.' : 'Sin movimientos recientes.'}
          </p>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-border">
          {movements.map((mv) => (
            <MovementRow key={`${mv.type}-${mv.id}`} mv={mv} />
          ))}
        </ul>
      )}

      <Link
        to="/reportes"
        viewTransition
        className="mt-3 flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline focus-visible:underline"
      >
        Ver todo en reportes
        <ArrowRight size={14} strokeWidth={1.5} aria-hidden />
      </Link>
    </section>
  );
}

// ── Apartados por cobrar ──────────────────────────────────────────────────────

function ApartadosCard({ data }: { data: DashboardData }) {
  const { activeCount, totalOwed, top } = data.apartados;

  return (
    <section
      aria-label="Apartados por cobrar"
      className="flex flex-col rounded-xl border border-border bg-surface-card p-4"
    >
      <div className="mb-1 flex items-center gap-2">
        <Package size={16} strokeWidth={1.5} className="text-brand-blue" aria-hidden />
        <h2 className="text-sm font-semibold text-text-primary">Apartados por cobrar</h2>
      </div>

      {activeCount === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8">
          <p className="text-sm text-text-muted">Sin apartados activos.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-text-muted">
            {activeCount} {activeCount === 1 ? 'activo' : 'activos'} ·{' '}
            <span className="font-medium text-text-primary">{formatColones(totalOwed)}</span> por
            cobrar
          </p>

          <div className="mt-4 flex flex-1 flex-col gap-3.5">
            {top.map((ap) => {
              const pct = ap.totalAmount > 0 ? (ap.paidAmount / ap.totalAmount) * 100 : 0;
              return (
                <div key={ap.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate text-text-primary" title={ap.customerName}>
                      {ap.customerName}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-text-secondary">
                      {formatColones(ap.paidAmount)} / {formatColones(ap.totalAmount)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-bg">
                    <div
                      className="h-full rounded-full bg-brand-success transition-[width] duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Link
        to="/apartados"
        viewTransition
        className="mt-3 flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline focus-visible:underline"
      >
        Ver apartados
        <ArrowRight size={14} strokeWidth={1.5} aria-hidden />
      </Link>
    </section>
  );
}

// ── Loading / error ───────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-surface-card px-4 py-4">
            <div className="h-3 w-16 rounded bg-border" />
            <div className="mt-2 h-6 w-24 rounded bg-border" />
            <div className="mt-2 h-3 w-20 rounded bg-border" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="h-[244px] rounded-xl border border-border bg-surface-card" />
        <div className="h-[244px] rounded-xl border border-border bg-surface-card" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="h-64 rounded-xl border border-border bg-surface-card" />
        <div className="h-64 rounded-xl border border-border bg-surface-card" />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function DashboardPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const todayLabel = longDateFmt.format(new Date());

  return (
    <div className="mx-auto max-w-6xl p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Resumen del día</h1>
          <p className="mt-0.5 text-sm capitalize text-text-muted">{todayLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {data && <CajaPill data={data} />}
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Actualizar"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-card text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
          >
            <RefreshCw
              size={15}
              strokeWidth={1.5}
              className={isFetching ? 'animate-spin' : ''}
              aria-hidden
            />
          </button>
        </div>
      </div>

      {isLoading ? (
        <DashboardSkeleton />
      ) : isError || !data ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface-card">
          <p className="text-sm text-text-muted">No se pudo cargar el resumen del día.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-brand-blue hover:bg-surface-bg"
          >
            <RefreshCw size={14} strokeWidth={1.5} aria-hidden />
            Reintentar
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <KpiStrip data={data} />

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <WeeklyChart weekly={data.weekly} />
            <PaymentMethods data={data} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <RecentMovements data={data} />
            <ApartadosCard data={data} />
          </div>
        </div>
      )}
    </div>
  );
}
