import { useState } from 'react';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import {
  BarChart3,
  Boxes,
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
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { can, ROLE_LABELS, type ModuleKey, type Permission } from '@dosuxsoft/shared';
import { useDarkMode } from '../../lib/hooks/useDarkMode';
import { authApi } from '../../features/auth/api';
import { useBusiness, useCurrentUser } from '../../features/auth/useCurrentUser';
import { SubscriptionNotice } from '../../features/subscription/SubscriptionNotice';

// `module`: solo aparece si el negocio lo tiene activo (perfil del negocio).
const NAV_ITEMS: ReadonlyArray<{
  to: string;
  label: string;
  icon: React.ElementType;
  exact: boolean;
  permission?: Permission;
  module?: ModuleKey;
}> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/pos', label: 'Punto de venta', icon: ShoppingCart, exact: false },
  { to: '/caja', label: 'Caja', icon: Landmark, exact: false },
  { to: '/inventario', label: 'Inventario', icon: Boxes, exact: false, module: 'inventario' },
  { to: '/boletas', label: 'Boletas', icon: FileText, exact: false, module: 'ordenes' },
  { to: '/clientes', label: 'Clientes', icon: Users, exact: false },
  { to: '/gastos', label: 'Gastos', icon: TrendingDown, exact: false },
  {
    to: '/cotizaciones',
    label: 'Cotizaciones',
    icon: FileOutput,
    exact: false,
    module: 'cotizaciones',
  },
  { to: '/facturas', label: 'Facturas', icon: Receipt, exact: false, module: 'facturas' },
  { to: '/apartados', label: 'Apartados', icon: Package, exact: false, module: 'apartados' },
  { to: '/creditos', label: 'Créditos', icon: CreditCard, exact: false, module: 'creditos' },
  { to: '/notas', label: 'Notas', icon: NotebookPen, exact: false },
  { to: '/reportes', label: 'Reportes', icon: BarChart3, exact: false },
  { to: '/usuarios', label: 'Usuarios', icon: UserCog, exact: false, permission: 'manageUsers' },
  {
    to: '/settings',
    label: 'Configuración',
    icon: Settings,
    exact: false,
    permission: 'manageSettings',
  },
];

function useNavItems() {
  const user = useCurrentUser();
  const business = useBusiness();
  return NAV_ITEMS.filter((item) => !item.permission || can(user.role, item.permission))
    .filter((item) => !item.module || business.modules.includes(item.module))
    .map((item) => (item.module === 'ordenes' ? { ...item, label: business.ordersLabel } : item));
}

function useIsActive() {
  const { location } = useRouterState();
  return (to: string, exact: boolean) =>
    exact
      ? location.pathname === to
      : location.pathname === to || location.pathname.startsWith(to + '/');
}

async function logout() {
  try {
    await authApi.logout();
  } catch {
    // ignore network errors on logout
  }
  window.location.href = '/login';
}

const railButton =
  'flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue';
const railIdle = 'text-text-muted hover:bg-surface-bg hover:text-text-primary';
const railActive = 'bg-brand-navy text-white dark:bg-brand-blue';

// El nombre del módulo aparece al pasar el mouse o con el teclado. Se dibuja con posición fija
// (no dentro de la barra) para que no lo recorte la barra cuando se desplaza.
type Tip = { label: string; top: number; left: number } | null;

function tipHandlers(label: string, setTip: (t: Tip) => void) {
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: r.right + 12 });
  };
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => show(e.currentTarget),
    onFocus: (e: React.FocusEvent<HTMLElement>) => show(e.currentTarget),
    onMouseLeave: () => setTip(null),
    onBlur: () => setTip(null),
  };
}

function IconRail() {
  const items = useNavItems();
  const isActive = useIsActive();
  const { isDark, toggle } = useDarkMode();
  const [tip, setTip] = useState<Tip>(null);

  return (
    <>
      <aside
        className="hidden min-h-0 shrink-0 flex-col items-center gap-0.5 self-center overflow-y-auto rounded-full border border-border bg-surface-card px-1.5 py-2.5 sm:-translate-y-9 [scrollbar-width:none] sm:flex"
        // Centrada respecto a la pantalla completa (sube la mitad del encabezado); el límite deja
        // margen para que, con muchos módulos, no se monte sobre el encabezado.
        style={{ maxHeight: 'calc(100dvh - 10rem)' }}
        aria-label="Navegación principal"
        onScroll={() => setTip(null)}
      >
        <button
          type="button"
          onClick={toggle}
          className={`${railButton} ${railIdle} shrink-0`}
          aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          {...tipHandlers(isDark ? 'Modo claro' : 'Modo oscuro', setTip)}
        >
          {isDark ? (
            <Sun size={19} strokeWidth={1.6} aria-hidden />
          ) : (
            <Moon size={19} strokeWidth={1.6} aria-hidden />
          )}
        </button>
        <span className="my-1 h-px w-7 shrink-0 bg-border" aria-hidden />

        <nav className="flex flex-col items-center gap-1">
          {items.map(({ to, label, icon: Icon, exact }) => {
            const active = isActive(to, exact);
            return (
              <Link
                key={to}
                to={to as never}
                viewTransition
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={`${railButton} ${active ? railActive : railIdle} shrink-0`}
                {...tipHandlers(label, setTip)}
              >
                <Icon size={19} strokeWidth={1.6} aria-hidden />
              </Link>
            );
          })}
        </nav>

        <span className="my-1 h-px w-7 shrink-0 bg-border" aria-hidden />
        <button
          type="button"
          onClick={() => void logout()}
          className={`${railButton} ${railIdle} shrink-0`}
          aria-label="Cerrar sesión"
          {...tipHandlers('Cerrar sesión', setTip)}
        >
          <LogOut size={19} strokeWidth={1.6} aria-hidden />
        </button>
      </aside>

      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 -translate-y-1/2 rounded-full bg-text-primary px-3 py-1.5 text-xs font-medium whitespace-nowrap text-surface-card shadow-[0_4px_14px_-2px_oklch(0%_0_0/0.25)]"
          style={{ top: tip.top, left: tip.left }}
        >
          {tip.label}
        </div>
      )}
    </>
  );
}

function UserPill({ onNav }: { onNav?: () => void }) {
  const user = useCurrentUser();
  const { location } = useRouterState();
  const onAccount = location.pathname === '/mi-cuenta';

  // Quién tiene la sesión abierta: en un mostrador compartido debe verse siempre.
  return (
    <Link
      to="/mi-cuenta"
      viewTransition
      {...(onNav ? { onClick: onNav } : {})}
      aria-current={onAccount ? 'page' : undefined}
      className={[
        'flex min-w-0 items-center gap-2.5 rounded-full border py-1 pr-4 pl-1 transition-colors duration-150',
        onAccount
          ? 'border-brand-blue/40 bg-surface-card'
          : 'border-border bg-surface-card hover:bg-surface-bg',
      ].join(' ')}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white dark:bg-brand-blue"
        aria-hidden
      >
        {user.displayName.trim().charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[13px] font-semibold text-text-primary">
          {user.displayName}
        </span>
        <span className="block truncate text-[11px] text-text-muted">{ROLE_LABELS[user.role]}</span>
      </span>
    </Link>
  );
}

function Brand() {
  return (
    <Link to="/" viewTransition className="flex shrink-0 items-center gap-2.5" aria-label="Inicio">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-navy dark:bg-brand-blue">
        <img src="/logo.png" alt="" width={20} height={20} aria-hidden />
      </span>
      <span className="text-base font-semibold tracking-tight text-text-primary">Dosuxsoft</span>
    </Link>
  );
}

function DrawerNav({ onNav }: { onNav: () => void }) {
  const items = useNavItems();
  const isActive = useIsActive();
  const { isDark, toggle } = useDarkMode();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Navegación principal">
        <ul className="m-0 list-none space-y-0.5 p-0">
          {items.map(({ to, label, icon: Icon, exact }) => {
            const active = isActive(to, exact);
            return (
              <li key={to}>
                <Link
                  to={to as never}
                  viewTransition
                  onClick={onNav}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'flex h-11 items-center gap-3 rounded-full px-4 text-sm transition-colors duration-150',
                    active
                      ? 'bg-brand-navy font-medium text-white dark:bg-brand-blue'
                      : 'text-text-secondary hover:bg-surface-bg hover:text-text-primary',
                  ].join(' ')}
                >
                  <Icon size={18} strokeWidth={1.6} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-0.5 border-t border-border px-3 py-3">
        <button
          type="button"
          onClick={toggle}
          className="flex h-11 w-full items-center gap-3 rounded-full px-4 text-sm text-text-secondary transition-colors duration-150 hover:bg-surface-bg hover:text-text-primary"
        >
          {isDark ? (
            <Sun size={18} strokeWidth={1.6} aria-hidden />
          ) : (
            <Moon size={18} strokeWidth={1.6} aria-hidden />
          )}
          {isDark ? 'Modo claro' : 'Modo oscuro'}
        </button>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex h-11 w-full items-center gap-3 rounded-full px-4 text-sm text-text-secondary transition-colors duration-150 hover:bg-surface-bg hover:text-text-primary"
        >
          <LogOut size={18} strokeWidth={1.6} aria-hidden />
          Cerrar sesión
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
    // overflow-hidden + main relativo: un elemento con posición absoluta dentro del contenido
    // (p. ej. los `sr-only`) no puede alargar la página ni hacer que el navegador la desplace entera.
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-surface-bg">
      {/* ── Barra superior ───────────────────────────────────────────────── */}
      <header
        className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface-card px-4 sm:h-[4.5rem] sm:border-b-0 sm:bg-transparent sm:px-5"
        inert={drawerOpen || undefined}
      >
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-bg hover:text-text-primary sm:hidden"
          aria-label="Abrir menú"
          aria-expanded={drawerOpen}
        >
          <Menu size={20} strokeWidth={1.6} aria-hidden />
        </button>
        <Brand />
        <div className="ml-auto hidden sm:block">
          <UserPill />
        </div>
      </header>

      {/* ── Celular: menú lateral ────────────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 sm:hidden"
          role="dialog"
          aria-modal
          aria-label="Menú de navegación"
        >
          <div className="absolute inset-0 bg-black/50" onClick={closeDrawer} aria-hidden />
          <aside className="absolute top-0 left-0 flex h-full w-72 flex-col bg-surface-card shadow-[0_8px_32px_-4px_oklch(0%_0_0/0.22)]">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <Brand />
              <button
                type="button"
                onClick={closeDrawer}
                className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-bg hover:text-text-primary"
                aria-label="Cerrar menú"
              >
                <X size={18} strokeWidth={1.6} aria-hidden />
              </button>
            </div>
            <div className="px-3 pt-3">
              <UserPill onNav={closeDrawer} />
            </div>
            <DrawerNav onNav={closeDrawer} />
          </aside>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-2 sm:pl-4" inert={drawerOpen || undefined}>
        <IconRail />
        <main className="vt-page relative min-w-0 flex-1 overflow-auto">
          <SubscriptionNotice />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
