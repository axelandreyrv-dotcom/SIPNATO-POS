import { createRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  FileOutput,
  FileText,
  Landmark,
  LayoutDashboard,
  NotebookPen,
  RefreshCw,
  ShoppingCart,
  TrendingDown,
  Users,
} from 'lucide-react';
import { formatColones } from '@sipnato/shared';
import { fmtTime } from '../../lib/format';
import { dashboardApi } from '../../features/dashboard/api';
import { Route as authRoute } from '../_auth';
import type { DashboardData } from '@sipnato/shared';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/',
  component: DashboardPage,
});

const MODULES = [
  { to: '/pos', label: 'Punto de venta', icon: ShoppingCart, desc: 'Registrar ventas' },
  { to: '/caja', label: 'Caja', icon: Landmark, desc: 'Control de efectivo' },
  { to: '/boletas', label: 'Boletas', icon: FileText, desc: 'Ingreso de equipos' },
  { to: '/clientes', label: 'Clientes', icon: Users, desc: 'Base de clientes' },
  { to: '/gastos', label: 'Gastos', icon: TrendingDown, desc: 'Egresos del día' },
  { to: '/cotizaciones', label: 'Cotizaciones', icon: FileOutput, desc: 'Presupuestos' },
  { to: '/notas', label: 'Notas', icon: NotebookPen, desc: 'Recordatorios' },
  { to: '/reportes', label: 'Reportes', icon: BarChart3, desc: 'Análisis de ventas' },
] as const;

const PM_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  sinpe: 'SINPE',
  transferencia: 'Transf.',
};

// ── Status strip ────────────────────────────────────────────────────────────

function StripSkeleton() {
  return (
    <div className="rounded-xl border border-border overflow-hidden mb-6 animate-pulse">
      <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-[auto_1fr_auto]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-surface-card px-4 py-3 flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-border" />
            <div className="h-3 w-32 rounded bg-border" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CajaZone({ data }: { data: DashboardData }) {
  const { isOpen, openedAt, openingAmount } = data.cashRegister;

  if (isOpen && openedAt) {
    return (
      <div className="bg-surface-card px-4 py-3 flex items-center gap-3 sm:min-w-[200px]">
        <span className="flex-shrink-0 h-2 w-2 rounded-full bg-brand-success" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-primary leading-none">Caja abierta</p>
          <p className="mt-1 text-xs text-text-muted">
            {fmtTime(openedAt)}
            {openingAmount > 0 && (
              <> · {formatColones(openingAmount)} apertura</>
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-card px-4 py-3 flex items-center gap-3 sm:min-w-[200px]">
      <span className="flex-shrink-0 h-2 w-2 rounded-full bg-brand-warning" aria-hidden />
      <div className="flex items-center gap-3">
        <p className="text-xs font-medium text-text-muted">Caja cerrada</p>
        <Link
          to="/caja"
          className="text-xs font-medium text-brand-blue hover:underline focus-visible:underline"
        >
          Abrir caja →
        </Link>
      </div>
    </div>
  );
}

function VentasZone({ data }: { data: DashboardData }) {
  const { byPaymentMethod } = data.today;
  const methods = ['efectivo', 'sinpe', 'tarjeta', 'transferencia'] as const;

  return (
    <div className="bg-surface-card px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
      {methods.map((method) => (
        <span key={method} className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-xs text-text-muted">{PM_LABELS[method]}</span>
          <span className="text-sm font-medium text-text-primary">
            {formatColones(byPaymentMethod[method])}
          </span>
        </span>
      ))}
    </div>
  );
}

function ContadoresZone({ data }: { data: DashboardData }) {
  const { salesCount, netBalance, boletasCount } = data.today;
  const balanceColor =
    netBalance > 0
      ? 'text-brand-success'
      : netBalance < 0
        ? 'text-brand-error'
        : 'text-text-muted';

  return (
    <div className="bg-surface-card px-4 py-3 flex flex-col justify-center gap-1 sm:min-w-[180px]">
      <span className={`text-sm font-semibold tabular-nums ${balanceColor}`}>
        {netBalance >= 0 ? '' : '–'}{formatColones(Math.abs(netBalance))}
        <span className="ml-1 text-xs font-normal text-text-muted">balance</span>
      </span>
      <span className="text-xs text-text-muted">
        {salesCount} {salesCount === 1 ? 'venta' : 'ventas'}
        {boletasCount > 0 && (
          <> · {boletasCount} {boletasCount === 1 ? 'boleta' : 'boletas'}</>
        )}
      </span>
    </div>
  );
}

function StatusStrip() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (isLoading) return <StripSkeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-border bg-surface-card px-4 py-3 mb-6 flex items-center gap-3 text-xs text-text-muted">
        <span>No se pudo cargar el resumen del día.</span>
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 text-brand-blue hover:underline disabled:opacity-50"
        >
          <RefreshCw size={12} strokeWidth={1.5} aria-hidden />
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden mb-6">
      <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-[auto_1fr_auto]">
        <CajaZone data={data} />
        <VentasZone data={data} />
        <ContadoresZone data={data} />
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function DashboardPage() {
  return (
    <div className="p-6 sm:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-text-muted mb-1">
          <LayoutDashboard size={16} strokeWidth={1.5} aria-hidden />
          <span className="text-xs font-medium uppercase tracking-wider">Dashboard</span>
        </div>
        <h1 className="text-2xl font-semibold text-text-primary">Bienvenido</h1>
      </div>

      <StatusStrip />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {MODULES.map(({ to, label, icon: Icon, desc }, index) => (
          <Link
            key={to}
            to={to as never}
            viewTransition
            style={{ animationDelay: `${index * 45}ms` }}
            className={[
              'group flex flex-col items-center gap-3 rounded-xl p-5 text-center',
              'border border-border bg-surface-card transition-all duration-200',
              'hover:border-brand-blue/30 hover:shadow-sm active:scale-[0.98]',
              'animate-fade-up',
            ].join(' ')}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-blue/8 transition-colors group-hover:bg-brand-blue/14">
              <Icon size={24} strokeWidth={1.5} className="text-brand-blue" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">{label}</p>
              <p className="mt-0.5 text-xs text-text-muted">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
