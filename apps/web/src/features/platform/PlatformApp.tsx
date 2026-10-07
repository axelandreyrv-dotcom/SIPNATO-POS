import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Loader2, LogOut, Moon, Sun } from 'lucide-react';
import type { Superadmin } from '@sipnato/shared';
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
      <header className="sticky top-0 z-20 border-b border-white/10 bg-brand-navy">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2.5"
            aria-label="Dosuxsoft · Plataforma"
          >
            <img src="/logo.png" alt="" width={24} height={24} aria-hidden />
            <span className="hidden text-sm font-semibold tracking-tight text-white sm:inline">
              Dosuxsoft <span className="font-normal text-white/50">· Plataforma</span>
            </span>
          </Link>

          <nav className="flex h-full items-stretch gap-1" aria-label="Secciones">
            {NAV.map((item) => {
              const active = item.match(path);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'flex items-center border-b-2 px-2 text-sm transition-colors duration-150',
                    active
                      ? 'border-white font-medium text-white'
                      : 'border-transparent text-white/60 hover:text-white',
                  ].join(' ')}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <span className="mr-2 hidden text-sm text-white/60 sm:inline">@{admin.username}</span>
            <button
              type="button"
              onClick={toggle}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={isDark ? 'Modo claro' : 'Modo oscuro'}
            >
              {isDark ? (
                <Sun size={18} strokeWidth={1.5} aria-hidden />
              ) : (
                <Moon size={18} strokeWidth={1.5} aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Cerrar sesión"
            >
              <LogOut size={18} strokeWidth={1.5} aria-hidden />
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
