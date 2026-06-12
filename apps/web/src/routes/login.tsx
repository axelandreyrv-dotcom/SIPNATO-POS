import { useState } from 'react';
import { createRoute, redirect, useNavigate } from '@tanstack/react-router';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { loginSchema } from '@sipnato/shared';
import { ApiError } from '@/lib/api-client';
import { authApi } from '@/features/auth/api';
import { AuthShell } from '@/features/auth/AuthShell';
import { Route as rootRoute } from './__root';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: async () => {
    const isRouterRedirect = (e: unknown) =>
      typeof e === 'object' && e !== null && '_isRedirect' in e;

    // Already authed → go to dashboard
    try {
      await authApi.getMe();
      throw redirect({ to: '/' });
    } catch (err) {
      if (isRouterRedirect(err)) throw err;
      // Not authed (401 or network error) — fall through
    }

    // Check if first-time setup is needed
    try {
      const { setup } = await authApi.getStatus();
      if (!setup) throw redirect({ to: '/setup' });
    } catch (err) {
      if (isRouterRedirect(err)) throw err;
      // Network error → show login (server unreachable)
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ password });
    if (!parsed.success) {
      setError('Ingresa tu contraseña.');
      return;
    }

    setLoading(true);
    try {
      await authApi.login(parsed.data);
      await navigate({ to: '/' });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('No se pudo conectar con el servidor.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="space-y-8">
        {/* Heading */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            Iniciar sesión
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Acceso al sistema Dosuxsoft
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Password field */}
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-text-secondary">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                className={[
                  'h-10 w-full rounded-lg border px-3 pr-10 text-sm text-text-primary',
                  'bg-surface-input outline-none transition-all duration-150',
                  'placeholder:text-text-muted',
                  error
                    ? 'border-brand-error ring-1 ring-brand-error/20'
                    : 'border-border focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20',
                ].join(' ')}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text-secondary"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? (
                  <EyeOff size={16} strokeWidth={1.5} />
                ) : (
                  <Eye size={16} strokeWidth={1.5} />
                )}
              </button>
            </div>
            {/* Error message */}
            {error && (
              <p
                role="alert"
                className="flex items-center gap-1.5 text-xs text-brand-error"
                style={{ animation: 'slideDown 0.15s ease-out' }}
              >
                {error}
              </p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className={[
              'flex h-10 w-full items-center justify-center gap-2 rounded-lg',
              'bg-brand-blue text-sm font-medium text-white',
              'transition-all duration-150',
              'hover:brightness-110 active:scale-[0.98] active:brightness-95',
              'disabled:cursor-not-allowed disabled:opacity-60',
            ].join(' ')}
          >
            {loading ? (
              <>
                <Loader2 size={15} strokeWidth={2} className="animate-spin" />
                Verificando...
              </>
            ) : (
              'Ingresar'
            )}
          </button>
        </form>

        {/* Recovery link */}
        <div className="border-t border-border pt-5">
          <p className="text-center text-sm text-text-muted">
            ¿Olvidaste tu contraseña?{' '}
            <a
              href="/recover"
              onClick={(e) => {
                e.preventDefault();
                void navigate({ to: '/recover' });
              }}
              className="font-medium text-brand-blue underline-offset-4 hover:underline"
            >
              Recuperar acceso
            </a>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </AuthShell>
  );
}
