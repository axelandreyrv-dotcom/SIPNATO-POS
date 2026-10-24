import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Loader2, LogOut, Moon, Sun } from 'lucide-react';
import type { Superadmin } from '@dosuxsoft/shared';
import { ApiError } from '@/lib/api-client';
import { useDarkMode } from '@/lib/hooks/useDarkMode';
import { platformApi } from './api';
import { LoginPage } from './LoginPage';
import { NewTenantPage } from './NewTenantPage';
import { Link, navigate, usePath } from './router';
import { SettingsPage } from './SettingsPage';
import { TenantDetailPage } from './TenantDetailPage';
import { TenantsPage } from './TenantsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Una sesión vencida (401) no se reintenta: lleva al login.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

// Cualquier 401 en una consulta del panel invalida la sesión y muestra el login.
queryClient.getQueryCache().subscribe((event) => {
  const err = event.query.state.error;
  if (
    event.type === 'updated' &&
    err instanceof ApiError &&
    err.status === 401 &&
    event.query.queryKey[0] !== 'platform-me'
  ) {
    void queryClient.invalidateQueries({ queryKey: ['platform-me'] });
  }
});

export default function PlatformApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <Gate />
    </QueryClientProvider>
  );
}

function Gate() {
  const me = useQuery({
    queryKey: ['platform-me'],
    queryFn: platformApi.me,
    retry: false,
    staleTime: Infinity,
  });

  if (me.isPending) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-surface-bg">
        <Loader2
          size={20}
          strokeWidth={1.5}
          className="animate-spin text-text-muted"
          aria-label="Cargando"
        />
      </div>
    );
  }
  if (!me.data || me.isError) return <LoginPage />;
  return <Shell admin={me.data.superadmin} />;
}

const NAV = [
  {
    to: '/',
    label: 'Negocios',
    match: (p: string) => p === '/' || p.startsWith('/negocios') || p === '/nuevo',
  },
  { to: '/configuracion', label: 'Configuración', match: (p: string) => p === '/configuracion' },
];

function Shell({ admin }: { admin: Superadmin }) {
  const path = usePath();
  const client = useQueryClient();
  const { isDark, toggle } = useDarkMode();

  const logout = useMutation({
    mutationFn: platformApi.logout,
    onSettled: () => {
      client.clear();
      navigate('/');
    },
  });

  return (
    <div className="min-h-[100dvh] bg-surface-bg">
      <header className="sticky top-0 z-20 bg-surface-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2.5"
            aria-label="Dosuxsoft · Plataforma"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-navy dark:bg-brand-blue">
              <img src="/logo.png" alt="" width={20} height={20} aria-hidden />
            </span>
            <span className="hidden text-base font-semibold tracking-tight text-text-primary md:inline">
              Dosuxsoft <span className="font-normal text-text-muted">· Plataforma</span>
            </span>
          </Link>

          <nav
            className="flex items-center gap-1 rounded-full border border-border bg-surface-card p-1 sm:mx-auto"
            aria-label="Secciones"
          >
            {NAV.map((item) => {
              const active = item.match(path);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'flex h-9 items-center rounded-full px-3.5 text-sm transition-colors duration-150 sm:px-4',
                    active
                      ? 'bg-brand-navy font-medium text-white dark:bg-brand-blue'
                      : 'text-text-secondary hover:text-text-primary',
                  ].join(' ')}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:ml-0">
            <span className="mr-1 hidden text-sm text-text-secondary lg:inline">
              @{admin.username}
            </span>
            <button
              type="button"
              onClick={toggle}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-card text-text-secondary transition-colors hover:text-text-primary"
              aria-label={isDark ? 'Modo claro' : 'Modo oscuro'}
            >
              {isDark ? (
                <Sun size={18} strokeWidth={1.6} aria-hidden />
              ) : (
                <Moon size={18} strokeWidth={1.6} aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-card text-text-secondary transition-colors hover:text-text-primary"
              aria-label="Cerrar sesión"
            >
              <LogOut size={18} strokeWidth={1.6} aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Page path={path} />
      </main>
    </div>
  );
}

function Page({ path }: { path: string }) {
  if (path === '/nuevo') return <NewTenantPage />;
  if (path === '/configuracion') return <SettingsPage />;
  const detail = /^\/negocios\/([a-z0-9-]+)$/.exec(path);
  if (detail) return <TenantDetailPage slug={detail[1]!} />;
  return <TenantsPage />;
}
