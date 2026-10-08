import { useState } from 'react';
import { createRoute, isRedirect, redirect, useNavigate } from '@tanstack/react-router';
import { CheckCircle, Copy, Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react';
import { setupSchema } from '@sipnato/shared';
import { ApiError } from '@/lib/api-client';
import { authApi } from '@/features/auth/api';
import { redirectIfTenantUnavailable } from '@/features/auth/tenant-guard';
import { AuthShell } from '@/features/auth/AuthShell';
import { Route as rootRoute } from './__root';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  beforeLoad: async () => {
    try {
      const { setup } = await authApi.getStatus();
      if (setup) throw redirect({ to: '/login' });
    } catch (err) {
      if (isRedirect(err)) throw err;
      redirectIfTenantUnavailable(err);
      // Network error → fall through and show setup form
    }
  },
  component: SetupPage,
});

function SetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [copied, setCopied] = useState(false);

  // Form state
  const [setupCode, setSetupCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<{
    setupCode?: string;
    displayName?: string;
    username?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const parsed = setupSchema.safeParse({
      setupCode,
      displayName,
      username,
      password,
      confirmPassword: confirm,
    });
    if (!parsed.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'setupCode') fieldErrors.setupCode = issue.message;
        if (field === 'displayName') fieldErrors.displayName = issue.message;
        if (field === 'username') fieldErrors.username = issue.message;
        if (field === 'password') fieldErrors.password = issue.message;
        if (field === 'confirmPassword') fieldErrors.confirmPassword = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      const { recoveryCode: code } = await authApi.setup(parsed.data);
      setRecoveryCode(code);
      setStep('code');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SETUP_CODE_INVALID') {
        setErrors({ setupCode: err.message });
      } else if (err instanceof ApiError) {
        setErrors({ password: err.message });
      } else {
        setErrors({ password: 'No se pudo conectar con el servidor.' });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(recoveryCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (step === 'code') {
    return (
      <AuthShell>
        <div className="space-y-8">
          {/* Success header */}
          <div className="flex items-start gap-3">
            <CheckCircle
              size={22}
              strokeWidth={1.5}
              className="mt-0.5 shrink-0 text-brand-success"
            />
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-text-primary">
                Cuenta creada
              </h1>
              <p className="mt-1 text-sm text-text-muted">Dosuxsoft está listo para usar.</p>
            </div>
          </div>

          {/* Warning box */}
          <div className="rounded-xl border border-brand-warning/30 bg-brand-warning/8 p-4">
            <div className="mb-2 flex items-center gap-2">
              <ShieldAlert size={15} strokeWidth={1.5} className="text-brand-warning" />
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-warning">
                Guarda este código ahora
              </p>
            </div>
            <p className="text-xs leading-relaxed text-text-secondary">
              Este código de recuperación es la única forma de recuperar el acceso si pierdes tu
              contraseña. No se mostrará de nuevo.
            </p>
          </div>

          {/* Recovery code */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-secondary">Código de recuperación</p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-input p-3">
              <code className="flex-1 break-all font-mono text-sm tracking-wider text-text-primary">
                {recoveryCode}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className={[
                  'shrink-0 rounded-md p-1.5 text-text-muted transition-all duration-150',
                  'hover:bg-border hover:text-text-primary',
                  copied ? 'text-brand-success' : '',
                ].join(' ')}
                aria-label="Copiar código"
              >
                {copied ? (
                  <CheckCircle size={16} strokeWidth={1.5} />
                ) : (
                  <Copy size={16} strokeWidth={1.5} />
                )}
              </button>
            </div>
            {copied && <p className="text-xs text-brand-success">Copiado al portapapeles</p>}
          </div>

          {/* Continue */}
          <button
            type="button"
            onClick={() => void navigate({ to: '/' })}
            className={[
              'flex h-10 w-full items-center justify-center rounded-lg',
              'bg-brand-blue text-sm font-medium text-white',
              'transition-all duration-150 hover:brightness-110 active:scale-[0.98]',
            ].join(' ')}
          >
            Continuar al sistema
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="space-y-8">
        {/* Heading */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            Configurar sistema
          </h1>
          <p className="mt-1 text-sm text-text-muted">Primera configuración de Dosuxsoft</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Setup code — evita que un tercero reclame un negocio recién creado */}
          <div className="space-y-1.5">
            <label htmlFor="setup-code" className="block text-sm font-medium text-text-secondary">
              Código de activación
            </label>
            <input
              id="setup-code"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              value={setupCode}
              onChange={(e) => {
                setSetupCode(e.target.value);
                if (errors.setupCode) setErrors(({ setupCode: _s, ...rest }) => rest);
              }}
              className={[
                'h-10 w-full rounded-lg border px-3 font-mono text-sm tracking-wider text-text-primary',
                'bg-surface-input outline-none transition-all duration-150 placeholder:text-text-muted',
                errors.setupCode
                  ? 'border-brand-error ring-1 ring-brand-error/20'
                  : 'border-border focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20',
              ].join(' ')}
              placeholder="XXXX-XXXX-XXXX-XXXX"
            />
            {errors.setupCode ? (
              <p
                role="alert"
                className="text-xs text-brand-error"
                style={{ animation: 'slideDown 0.15s ease-out' }}
              >
                {errors.setupCode}
              </p>
            ) : (
              <p className="text-xs text-text-muted">
                Lo recibiste junto con la dirección de tu negocio.
              </p>
            )}
          </div>

          {/* Dueño: nombre y usuario */}
          <div className="grid gap-5 sm:grid-cols-2">
            {(
              [
                ['displayName', 'Tu nombre', displayName, setDisplayName, 'María Rojas', 'name'],
                [
                  'username',
                  'Usuario',
                  username,
                  (v: string) => setUsername(v.toLowerCase()),
                  'maria',
                  'username',
                ],
              ] as const
            ).map(([field, label, value, set, placeholder, autoComplete]) => (
              <div key={field} className="space-y-1.5">
                <label
                  htmlFor={`setup-${field}`}
                  className="block text-sm font-medium text-text-secondary"
                >
                  {label}
                </label>
                <input
                  id={`setup-${field}`}
                  type="text"
                  autoComplete={autoComplete}
                  autoCapitalize={field === 'username' ? 'none' : 'words'}
                  spellCheck={false}
                  value={value}
                  onChange={(e) => {
                    set(e.target.value);
                    if (errors[field]) setErrors(({ [field]: _x, ...rest }) => rest);
                  }}
                  placeholder={placeholder}
                  className={[
                    'h-10 w-full rounded-lg border px-3 text-sm text-text-primary',
                    'bg-surface-input outline-none transition-all duration-150 placeholder:text-text-muted',
                    errors[field]
                      ? 'border-brand-error ring-1 ring-brand-error/20'
                      : 'border-border focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20',
                  ].join(' ')}
                />
                {errors[field] && (
                  <p role="alert" className="text-xs text-brand-error">
                    {errors[field]}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-text-secondary">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPwd ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors(({ password: _p, ...rest }) => rest);
                }}
                className={[
                  'h-10 w-full rounded-lg border px-3 pr-10 text-sm text-text-primary',
                  'bg-surface-input outline-none transition-all duration-150 placeholder:text-text-muted',
                  errors.password
                    ? 'border-brand-error ring-1 ring-brand-error/20'
                    : 'border-border focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20',
                ].join(' ')}
                placeholder="Mínimo 8 caracteres"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text-secondary"
                aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPwd ? (
                  <EyeOff size={16} strokeWidth={1.5} />
                ) : (
                  <Eye size={16} strokeWidth={1.5} />
                )}
              </button>
            </div>
            {errors.password && (
              <p
                role="alert"
                className="text-xs text-brand-error"
                style={{ animation: 'slideDown 0.15s ease-out' }}
              >
                {errors.password}
              </p>
            )}
          </div>

          {/* Confirm */}
          <div className="space-y-1.5">
            <label htmlFor="confirm" className="block text-sm font-medium text-text-secondary">
              Confirmar contraseña
            </label>
            <div className="relative">
              <input
                id="confirm"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  if (errors.confirmPassword) setErrors(({ confirmPassword: _c, ...rest }) => rest);
                }}
                className={[
                  'h-10 w-full rounded-lg border px-3 pr-10 text-sm text-text-primary',
                  'bg-surface-input outline-none transition-all duration-150 placeholder:text-text-muted',
                  errors.confirmPassword
                    ? 'border-brand-error ring-1 ring-brand-error/20'
                    : 'border-border focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20',
                ].join(' ')}
                placeholder="Repite la contraseña"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text-secondary"
                aria-label={showConfirm ? 'Ocultar' : 'Mostrar'}
              >
                {showConfirm ? (
                  <EyeOff size={16} strokeWidth={1.5} />
                ) : (
                  <Eye size={16} strokeWidth={1.5} />
                )}
              </button>
            </div>
            {errors.confirmPassword && (
              <p
                role="alert"
                className="text-xs text-brand-error"
                style={{ animation: 'slideDown 0.15s ease-out' }}
              >
                {errors.confirmPassword}
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
              'transition-all duration-150 hover:brightness-110 active:scale-[0.98] active:brightness-95',
              'disabled:cursor-not-allowed disabled:opacity-60',
            ].join(' ')}
          >
            {loading ? (
              <>
                <Loader2 size={15} strokeWidth={2} className="animate-spin" />
                Configurando...
              </>
            ) : (
              'Crear cuenta'
            )}
          </button>
        </form>
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
