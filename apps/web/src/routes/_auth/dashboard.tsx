import { lazy, Suspense, useState } from 'react';
import { createRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Building2,
  CreditCard,
  DollarSign,
  FilePlus,
  Landmark,
  Package,
  ReceiptText,
  RefreshCw,
  ShoppingCart,
  Smartphone,
  TrendingDown,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { formatColones, formatExchangeRate, PAYMENT_METHOD_LABELS } from '@dosuxsoft/shared';
import type {
  DashboardData,
  DashboardMovement,
  DashboardWeeklyEntry,
  ExchangeRateInfo,
  PaymentMethod,
} from '@dosuxsoft/shared';
import { fmtDateShort, fmtTime } from '../../lib/format';
import { dashboardApi } from '../../features/dashboard/api';
import { exchangeRateApi } from '../../features/pos/exchange-rate-api';
import { Route as authRoute } from '../_auth';
import { useBusiness, useCurrentUser, useModuleEnabled } from '../../features/auth/useCurrentUser';

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

// El saludo sigue la hora de Costa Rica, no la del navegador.
function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Costa_Rica',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

const PM_ORDER: PaymentMethod[] = ['efectivo', 'sinpe', 'tarjeta', 'transferencia', 'dolares'];

const PM_ICON: Record<PaymentMethod, LucideIcon> = {
  efectivo: Banknote,
  sinpe: Smartphone,
  tarjeta: CreditCard,
  transferencia: Building2,
  dolares: DollarSign,
};

const card = 'rounded-3xl border border-border bg-surface-card';

// ── Header pills ─────────────────────────────────────────────────────────────

// El que se usa al cobrar en dólares: compra del BCCR, o el respaldo manual si el BCCR no tiene
// un dato reciente (lo decide el servidor, ver lib/exchange-rate.ts).
function DolarPill({ info }: { info: ExchangeRateInfo }) {
  const pill =
    'flex h-10 items-center gap-2 rounded-full border border-border bg-surface-card px-4 text-sm';

  if (info.source === 'bccr' && info.bccrBuy !== null) {
    const sell = info.bccrSell !== null ? ` · venta ${formatExchangeRate(info.bccrSell)}` : '';
    return (
      <div
        className={pill}
        title={info.date ? `Tipo de cambio del BCCR del ${fmtDateShort(info.date)}` : undefined}
      >
        <span className="text-text-muted">Dólar</span>
        <span className="tabular-nums text-text-primary">
          compra <span className="font-medium">{formatExchangeRate(info.bccrBuy)}</span>
          <span className="text-text-muted">{sell}</span>
        </span>
      </div>
    );
  }

  if (info.source === 'manual' && info.rate !== null) {
    return (
      <div
        className={pill}
        title="El BCCR no tiene un dato reciente: se usa el tipo de cambio de respaldo de Configuración"
      >
        <span className="text-text-muted">Dólar</span>
        <span className="font-medium tabular-nums text-text-primary">
          {formatExchangeRate(info.rate)}
        </span>
        <span className="text-xs text-text-muted">respaldo</span>
      </div>
    );
  }

  return (
    <div className={pill}>
      <span className="text-text-muted">Dólar: sin tipo de cambio</span>
    </div>
  );
}

// ── Ventas de hoy: monto, acciones y métodos de pago ─────────────────────────

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
    <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
      <span className="inline-flex items-center gap-0.5 rounded-md bg-surface-bg px-1.5 py-0.5 font-semibold text-text-primary">
        {up ? (
          <ArrowUpRight size={13} strokeWidth={1.75} aria-hidden />
        ) : (
          <ArrowDownRight size={13} strokeWidth={1.75} aria-hidden />
        )}
        {Math.abs(rounded)}%
      </span>
      vs ayer
    </span>
  );
}

// Hasta tres métodos: primero los que tuvieron cobros hoy; si faltan, los más comunes.
function visibleMethods(byMethod: DashboardData['today']['byPaymentMethod']): PaymentMethod[] {
  const used = PM_ORDER.filter((m) => byMethod[m] > 0);
  const filler = PM_ORDER.filter((m) => !used.includes(m));
  return [...used, ...filler].slice(0, Math.max(3, used.length));
}

function SalesCard({ data }: { data: DashboardData }) {
  const { totalSales, salesCount, salesDeltaPct, byPaymentMethod } = data.today;
  const { isOpen, openedAt } = data.cashRegister;
  const ordersEnabled = useModuleEnabled('ordenes');
  const methods = visibleMethods(byPaymentMethod);
  const usedCount = PM_ORDER.filter((m) => byPaymentMethod[m] > 0).length;

  const actionBase =
    'flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-medium transition-[filter,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card';

  return (
    <section aria-label="Ventas de hoy" className={`${card} flex flex-col p-5 sm:p-6`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm text-text-secondary">Ventas de hoy</h2>
        {isOpen && openedAt ? (
          <span className="flex items-center gap-1.5 text-xs text-text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-success" aria-hidden />
            Caja abierta · {fmtTime(openedAt)}
          </span>
        ) : (
          <Link
            to="/caja"
            viewTransition
            className="flex items-center gap-1.5 text-xs font-medium text-text-primary hover:underline focus-visible:underline"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-brand-warning" aria-hidden />
            Caja cerrada · Abrir
          </Link>
        )}
      </div>

      <p className="mt-2 text-[2.125rem] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-text-primary">
        {formatColones(totalSales)}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <DeltaBadge pct={salesDeltaPct} />
        <span className="text-xs text-text-muted">
          · {salesCount} {salesCount === 1 ? 'venta' : 'ventas'}
        </span>
      </div>

      <div className="mt-5 flex gap-2.5">
        <Link
          to="/pos"
          viewTransition
          className={`${actionBase} bg-brand-navy text-white hover:brightness-125 dark:bg-brand-blue dark:hover:brightness-110`}
        >
          <ShoppingCart size={18} strokeWidth={1.75} aria-hidden />
          Cobrar
        </Link>
        {ordersEnabled ? (
          <Link
            to="/nueva-boleta"
            viewTransition
            className={`${actionBase} border border-border bg-surface-bg text-text-primary hover:bg-border/60`}
          >
            <FilePlus size={18} strokeWidth={1.75} aria-hidden />
            Nueva orden
          </Link>
        ) : (
          <Link
            to="/gastos"
            viewTransition
            className={`${actionBase} border border-border bg-surface-bg text-text-primary hover:bg-border/60`}
          >
            <TrendingDown size={18} strokeWidth={1.75} aria-hidden />
            Registrar gasto
          </Link>
        )}
      </div>

      <div className="mt-5 rounded-2xl bg-surface-bg p-3.5">
        <p className="mb-2.5 text-[13px] text-text-secondary">
          <span className="font-semibold text-text-primary">Métodos de pago</span>
          {usedCount > 0 ? ` · ${usedCount} usados hoy` : ' · aún sin cobros'}
        </p>
        <div className="grid gap-1.5 sm:grid-cols-3 sm:gap-2">
          {methods.map((m) => {
            const Icon = PM_ICON[m];
            return (
              <div
                key={m}
                className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-surface-card px-3 py-2.5 sm:block"
              >
                <p className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <Icon size={14} strokeWidth={1.75} className="shrink-0" aria-hidden />
                  <span className="truncate">{PAYMENT_METHOD_LABELS[m]}</span>
                </p>
                <p className="truncate text-[15px] font-semibold tabular-nums text-text-primary sm:mt-1.5">
                  {formatColones(byPaymentMethod[m])}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Indicadores ──────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  note,
  icon: Icon,
  featured = false,
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  featured?: boolean;
}) {
  return (
    <div
      className={[
        'flex min-h-[150px] flex-col rounded-3xl p-5',
        featured ? 'bg-brand-blue text-white' : 'border border-border bg-surface-card',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm ${featured ? 'text-white/85' : 'text-text-secondary'}`}>{label}</p>
        <span
          className={[
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            featured ? 'bg-white/20 text-white' : 'bg-surface-bg text-text-secondary',
          ].join(' ')}
        >
          <Icon size={16} strokeWidth={1.75} aria-hidden />
        </span>
      </div>
      <p
        className={`mt-auto pt-4 text-2xl sm:text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] tabular-nums ${
          featured ? 'text-white' : 'text-text-primary'
        }`}
      >
        {value}
      </p>
      <p className={`mt-1 text-xs ${featured ? 'text-white/85' : 'text-text-muted'}`}>{note}</p>
    </div>
  );
}

function StatGrid({ data }: { data: DashboardData }) {
  const { totalExpenses, netBalance, boletasCount, salesCount } = data.today;
  const { ordersLabel, modules } = useBusiness();
  const showOrders = modules.includes('ordenes');

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <StatTile
        featured
        label="Balance del día"
        value={`${netBalance < 0 ? '−' : ''}${formatColones(Math.abs(netBalance))}`}
        note="ingresos − gastos"
        icon={Wallet}
      />
      <StatTile
        label="Gastos"
        value={formatColones(totalExpenses)}
        note="egresos de caja"
        icon={TrendingDown}
      />
      {showOrders ? (
        <StatTile
          label={`${ordersLabel} hoy`}
          value={String(boletasCount)}
          note="ingresos registrados"
          icon={Wrench}
        />
      ) : (
        <StatTile
          label="Fondo de caja"
          value={formatColones(data.cashRegister.openingAmount)}
          note={data.cashRegister.isOpen ? 'monto de apertura' : 'caja cerrada'}
          icon={Landmark}
        />
      )}
      <StatTile
        label="Cobros"
        value={String(salesCount)}
        note={salesCount === 1 ? 'venta registrada' : 'ventas registradas'}
        icon={ReceiptText}
      />
    </div>
  );
}

// ── Gráfico semanal ──────────────────────────────────────────────────────────

const SalesBarChart = lazy(() => import('../../components/charts/SalesBarChart'));

function WeeklyChart({ weekly }: { weekly: DashboardWeeklyEntry[] }) {
  const today = todayCR();
  const hasData = weekly.some((d) => d.total > 0);
  const weekTotal = weekly.reduce((sum, d) => sum + d.total, 0);

  return (
    <section aria-label="Ventas de los últimos 7 días" className={`${card} p-5 sm:p-6`}>
      <h2 className="text-lg font-semibold tracking-[-0.01em] text-text-primary">
        Ventas de la semana
      </h2>
      <p className="mt-0.5 text-sm text-text-secondary">
        {hasData ? (
          <>
            <span className="font-medium tabular-nums text-text-primary">
              {formatColones(weekTotal)}
            </span>{' '}
            en los últimos 7 días
          </>
        ) : (
          'Últimos 7 días'
        )}
      </p>
      <div className="mt-4">
        {!hasData ? (
          <div className="flex h-[200px] items-center justify-center rounded-2xl bg-surface-bg">
            <p className="text-sm text-text-muted">Sin ventas en la semana.</p>
          </div>
        ) : (
          <Suspense fallback={<div className="h-[200px]" />}>
            <SalesBarChart
              data={weekly}
              height={200}
              highlightDate={today}
              barRadius={8}
              xTick={(d) => (d === today ? 'Hoy' : weekdayShort(d))}
              tooltipLabel={weekdayShort}
            />
          </Suspense>
        )}
      </div>
    </section>
  );
}

// ── Movimientos recientes ────────────────────────────────────────────────────

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
  const method = isSale && mv.paymentMethod ? PAYMENT_METHOD_LABELS[mv.paymentMethod] : 'Gasto';

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="py-3 pr-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-bg text-text-secondary">
            <Icon size={15} strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm text-text-primary" title={label}>
              {label}
            </p>
            <p className="text-xs text-text-muted sm:hidden">
              {fmtTime(mv.createdAt)} · {method}
            </p>
          </div>
        </div>
      </td>
      <td className="hidden py-3 pr-3 text-sm text-text-secondary sm:table-cell">{method}</td>
      <td className="hidden py-3 pr-3 text-sm tabular-nums text-text-secondary sm:table-cell">
        {fmtTime(mv.createdAt)}
      </td>
      <td className="py-3 text-right text-sm font-semibold tabular-nums text-text-primary">
        {isSale ? '+' : '−'}
        {formatColones(mv.amount)}
      </td>
    </tr>
  );
}

function RecentMovements({ data }: { data: DashboardData }) {
  const [tab, setTab] = useState<MovementTab>('todo');
  const movements = data.recentMovements.filter((m) => tab === 'todo' || m.type === tab);

  return (
    <section aria-label="Movimientos recientes" className={`${card} flex flex-col p-5 sm:p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-text-primary">
          Movimientos recientes
        </h2>
        <div className="flex rounded-full border border-border bg-surface-bg p-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={`h-8 rounded-full px-3.5 text-xs font-medium transition-colors ${
                tab === key
                  ? 'bg-surface-card text-text-primary shadow-[0_1px_2px_rgb(0_0_0/0.08)]'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {movements.length === 0 ? (
        <div className="mt-4 flex flex-1 items-center justify-center rounded-2xl bg-surface-bg py-10">
          <p className="text-sm text-text-muted">
            {tab === 'expense' ? 'Sin gastos recientes.' : 'Sin movimientos recientes.'}
          </p>
        </div>
      ) : (
        <table className="mt-4 w-full table-fixed">
          <thead>
            <tr className="text-left text-xs text-text-muted">
              <th className="rounded-l-xl bg-surface-bg py-2.5 pr-3 pl-3 font-medium">
                Movimiento
              </th>
              <th className="hidden w-32 bg-surface-bg py-2.5 pr-3 font-medium sm:table-cell">
                Método
              </th>
              <th className="hidden w-20 bg-surface-bg py-2.5 pr-3 font-medium sm:table-cell">
                Hora
              </th>
              <th className="w-24 rounded-r-xl bg-surface-bg sm:w-32 py-2.5 pr-3 text-right font-medium">
                Monto
              </th>
            </tr>
          </thead>
          <tbody className="[&_td:first-child]:pl-3 [&_td:last-child]:pr-3">
            {movements.map((mv) => (
              <MovementRow key={`${mv.type}-${mv.id}`} mv={mv} />
            ))}
          </tbody>
        </table>
      )}

      <Link
        to="/reportes"
        viewTransition
        className="mt-4 inline-flex w-fit items-center gap-1 text-sm font-medium text-brand-blue hover:underline focus-visible:underline"
      >
        Ver todo en reportes
        <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
      </Link>
    </section>
  );
}

// ── Apartados por cobrar ─────────────────────────────────────────────────────

function ApartadosCard({ data }: { data: DashboardData }) {
  const { activeCount, totalOwed, top } = data.apartados;

  return (
    <section aria-label="Apartados por cobrar" className={`${card} flex flex-col p-5 sm:p-6`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-text-primary">Apartados</h2>
        <Package size={18} strokeWidth={1.75} className="text-text-muted" aria-hidden />
      </div>

      {activeCount === 0 ? (
        <div className="mt-4 flex flex-1 items-center justify-center rounded-2xl bg-surface-bg py-10">
          <p className="text-sm text-text-muted">Sin apartados activos.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-surface-bg px-3.5 py-3">
              <p className="text-xs text-text-secondary">Por cobrar</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-text-primary">
                {formatColones(totalOwed)}
              </p>
            </div>
            <div className="rounded-2xl bg-surface-bg px-3.5 py-3">
              <p className="text-xs text-text-secondary">Activos</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-text-primary">
                {activeCount}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-1 flex-col gap-4">
            {top.map((ap) => {
              const pct = ap.totalAmount > 0 ? (ap.paidAmount / ap.totalAmount) * 100 : 0;
              return (
                <div key={ap.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate text-text-primary" title={ap.customerName}>
                      {ap.customerName}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-text-secondary">
                      {formatColones(ap.paidAmount)} / {formatColones(ap.totalAmount)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-bg">
                    <div
                      className="h-full rounded-full bg-brand-blue transition-[width] duration-500"
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
        className="mt-5 inline-flex w-fit items-center gap-1 text-sm font-medium text-brand-blue hover:underline focus-visible:underline"
      >
        Ver apartados
        <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
      </Link>
    </section>
  );
}

// ── Loading / error ──────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${card} h-[340px]`} />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${card} h-[150px]`} />
          ))}
        </div>
      </div>
      <div className={`${card} h-72`} />
      <div className={`${card} h-72`} />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function DashboardPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const exchangeRate = useQuery({
    queryKey: ['exchange-rate'],
    queryFn: exchangeRateApi.get,
    staleTime: 30 * 60 * 1000,
  });
  const apartadosEnabled = useModuleEnabled('apartados');
  const user = useCurrentUser();
  const firstName = user.displayName.trim().split(/\s+/)[0] ?? '';

  const todayLabel = longDateFmt.format(new Date());

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:p-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-text-primary sm:text-[2.5rem]">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="mt-1.5 text-[15px] text-text-secondary">
            Esto es lo que pasa hoy · <span className="capitalize">{todayLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {exchangeRate.data && <DolarPill info={exchangeRate.data} />}
          <button
            type="button"
            onClick={() => {
              void refetch();
              void exchangeRate.refetch();
            }}
            disabled={isFetching}
            aria-label="Actualizar"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-card text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              strokeWidth={1.75}
              className={isFetching ? 'animate-spin' : ''}
              aria-hidden
            />
          </button>
        </div>
      </div>

      {isLoading ? (
        <DashboardSkeleton />
      ) : isError || !data ? (
        <div
          className={`${card} flex h-48 flex-col items-center justify-center gap-3 border-dashed`}
        >
          <p className="text-sm text-text-muted">No se pudo cargar el resumen del día.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium text-brand-blue hover:bg-surface-bg"
          >
            <RefreshCw size={14} strokeWidth={1.75} aria-hidden />
            Reintentar
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <SalesCard data={data} />
            <StatGrid data={data} />
          </div>

          {apartadosEnabled ? (
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <WeeklyChart weekly={data.weekly} />
              <ApartadosCard data={data} />
            </div>
          ) : (
            <WeeklyChart weekly={data.weekly} />
          )}

          <RecentMovements data={data} />
        </div>
      )}
    </div>
  );
}
