import { createRoute } from '@tanstack/react-router';
import {
  BarChart3,
  FileOutput,
  FileText,
  Landmark,
  LayoutDashboard,
  NotebookPen,
  ShoppingCart,
  TrendingDown,
  Users,
} from 'lucide-react';
import { Route as authRoute } from '../_auth';

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

function DashboardPage() {
  return (
    <div className="p-6 sm:p-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-text-muted mb-1">
          <LayoutDashboard size={16} strokeWidth={1.5} aria-hidden />
          <span className="text-xs font-medium uppercase tracking-wider">Dashboard</span>
        </div>
        <h1 className="text-2xl font-semibold text-text-primary">Bienvenido</h1>
        <p className="mt-1 text-sm text-text-muted">Selecciona un módulo para comenzar.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {MODULES.map(({ to, label, icon: Icon, desc }) => (
          <a
            key={to}
            href={to}
            className={[
              'group flex flex-col items-center gap-3 rounded-xl p-5 text-center',
              'border border-border bg-surface-card transition-all duration-150',
              'hover:border-brand-blue/30 hover:shadow-sm active:scale-[0.98]',
            ].join(' ')}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-blue/8 transition-colors group-hover:bg-brand-blue/14">
              <Icon size={24} strokeWidth={1.5} className="text-brand-blue" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">{label}</p>
              <p className="mt-0.5 text-xs text-text-muted">{desc}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
