import { useState } from 'react';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import {
  BarChart3,
  CreditCard,
  FileOutput,
  FileText,
  Receipt,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  NotebookPen,
  Package,
  Settings,
  ShoppingCart,
  Sun,
  TrendingDown,
  Users,
  X,
} from 'lucide-react';
import { Logo } from '../../components/branding/Logo';
import { useDarkMode } from '../../lib/hooks/useDarkMode';
import { authApi } from '../../features/auth/api';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/pos', label: 'Punto de venta', icon: ShoppingCart, exact: false },
  { to: '/caja', label: 'Caja', icon: Landmark, exact: false },
  { to: '/boletas', label: 'Boletas', icon: FileText, exact: false },
  { to: '/clientes', label: 'Clientes', icon: Users, exact: false },
  { to: '/gastos', label: 'Gastos', icon: TrendingDown, exact: false },
  { to: '/cotizaciones', label: 'Cotizaciones', icon: FileOutput, exact: false },
  { to: '/facturas', label: 'Facturas', icon: Receipt, exact: false },
  { to: '/apartados', label: 'Apartados', icon: Package, exact: false },
  { to: '/creditos', label: 'Créditos', icon: CreditCard, exact: false },
  { to: '/notas', label: 'Notas', icon: NotebookPen, exact: false },
  { to: '/reportes', label: 'Reportes', icon: BarChart3, exact: false },
  { to: '/settings', label: 'Configuración', icon: Settings, exact: false },
] as const;

interface NavItemProps {
  to: string;
  label: string;
  icon: React.ElementType;
  exact: boolean;
  onClick?: () => void;
}

function NavItem({ to, label, icon: Icon, exact, onClick }: NavItemProps) {
  const { location } = useRouterState();
  const isActive = exact
    ? location.pathname === to
    : location.pathname === to || location.pathname.startsWith(to + '/');

  return (
    <Link
      to={to as never}
      viewTransition
      onClick={onClick}
      className={[
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150',
        isActive
          ? 'bg-white/[0.12] text-white font-medium'
          : 'text-white/60 hover:bg-white/[0.06] hover:text-white/90',
      ].join(' ')}
    >
      <Icon size={18} strokeWidth={1.5} aria-hidden />
      <span>{label}</span>
    </Link>
  );
}


function SidebarNav({ onNav }: { onNav?: () => void }) {
  const { isDark, toggle } = useDarkMode();

  async function handleLogout() {
    try {
      await authApi.logout();
    } catch {
      // ignore network errors on logout
    }
    window.location.href = '/login';
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Nav items */}
      <nav
        className="flex-1 overflow-y-auto px-3 py-2"
        aria-label="Navegación principal"
      >
        <ul className="space-y-0.5 list-none p-0 m-0">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavItem {...item} {...(onNav ? { onClick: onNav } : {})} />
            </li>
          ))}
        </ul>
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-white/10 px-3 py-3 space-y-0.5">
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/90"
          aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {isDark ? (
            <Sun size={18} strokeWidth={1.5} aria-hidden />
          ) : (
            <Moon size={18} strokeWidth={1.5} aria-hidden />
          )}
          <span>{isDark ? 'Modo claro' : 'Modo oscuro'}</span>
        </button>

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/90"
        >
          <LogOut size={18} strokeWidth={1.5} aria-hidden />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
}

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <div className="flex h-[100dvh] w-full">
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside className="hidden sm:flex sm:w-60 sm:shrink-0 flex-col bg-brand-navy">
        <div className="px-4 py-5">
          <Logo />
        </div>
        <SidebarNav />
      </aside>

      {/* ── Mobile: top bar ──────────────────────────────────────────────── */}
      <div
        className="sm:hidden fixed top-0 inset-x-0 z-40 flex h-14 items-center gap-3 bg-brand-navy px-4"
        inert={drawerOpen || undefined}
      >
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Abrir menú"
          aria-expanded={drawerOpen}
        >
          <Menu size={20} strokeWidth={1.5} aria-hidden />
        </button>
        <Logo />
      </div>

      {/* ── Mobile: slide-in drawer ───────────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal aria-label="Menú de navegación">
          {/* Scrim */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeDrawer}
            aria-hidden
          />
          {/* Panel */}
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-brand-navy shadow-[0_8px_32px_-4px_oklch(0%_0_0/0.22)]">
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
              <Logo />
              <button
                type="button"
                onClick={closeDrawer}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Cerrar menú"
              >
                <X size={18} strokeWidth={1.5} aria-hidden />
              </button>
            </div>
            <SidebarNav onNav={closeDrawer} />
          </aside>
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main
        className="flex-1 overflow-auto pt-14 sm:pt-0 bg-surface-bg vt-page"
        inert={drawerOpen || undefined}
      >
        <Outlet />
      </main>
    </div>
  );
}
