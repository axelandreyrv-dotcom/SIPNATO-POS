import { useState } from 'react';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { CheckCircle, Copy, Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react';
import { recoverSchema } from '@sipnato/shared';
import { ApiError } from '@/lib/api-client';
import { authApi } from '@/features/auth/api';
import { AuthShell } from '@/features/auth/AuthShell';
import { Route as rootRoute } from './__root';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recover',
  component: RecoverPage,
});

function RecoverPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [newRecoveryCode, setNewRecoveryCode] = useState('');
  const [copied, setCopied] = useState(false);

  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ recoveryCode?: string; newPassword?: string }>({});
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const parsed = recoverSchema.safeParse({ recoveryCode, newPassword });
    if (!parsed.success) {
      const fe: typeof fieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'recoveryCode') fe.recoveryCode = issue.message;
        if (field === 'newPassword') fe.newPassword = issue.message;
      }
      setFieldErrors(fe);
      return;
    }

    setLoading(true);
    try {
      const { newRecoveryCode: code } = await authApi.recover(parsed.data);
      setNewRecoveryCode(code);
      setStep('code');
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

  async function handleCopy() {
    await navigator.clipboard.writeText(newRecoveryCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (step === 'code') {
    return (
      <AuthShell>
        <div className="space-y-8">
          <div className="flex items-start gap-3">
            <CheckCircle size={22} strokeWidth={1.5} className="mt-0.5 shrink-0 text-brand-success" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-text-primary">
                Contraseña actualizada
              </h1>
              <p className="mt-1 text-sm text-text-muted">
                Tu acceso fue restaurado correctamente.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-brand-warning/30 bg-brand-warning/8 p-4">
            <div className="mb-2 flex items-center gap-2">
              <ShieldAlert size={15} strokeWidth={1.5} className="text-brand-warning" />
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-warning">
                Nuevo código de recuperación
              </p>
            </div>
            <p className="text-xs leading-relaxed text-text-secondary">
              El código anterior quedó invalidado. Guarda el nuevo ahora — no se mostrará de nuevo.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-text-secondary">Código de recuperación</p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-input p-3">
              <code className="flex-1 break-all font-mono text-sm tracking-wider text-text-primary">
                {newRecoveryCode}
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
                {copied ? <CheckCircle size={16} strokeWidth={1.5} /> : <Copy size={16} strokeWidth={1.5} />}
              </button>
            </div>
            {copied && (
              <p className="text-xs text-brand-success">Copiado al portapapeles</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void navigate({ to: '/' })}
            className={[
              'flex h-10 w-full items-center justify-center rounded-lg',
              'bg-brand-blue text-sm font-medium text-white',
              'transition-all duration-150 hover:brightness-110 active:scale-[0.98]',
            ].join(' ')}
          >
            Ir al sistema
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            Recuperar acceso
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Ingresa tu código de recuperación y una nueva contraseña.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-brand-error/30 bg-brand-error/8 px-4 py-3 text-sm text-brand-error"
            style={{ animation: 'slideDown 0.15s ease-out' }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Recovery code */}
          <div className="space-y-1.5">
            <label htmlFor="recovery-code" className="block text-sm font-medium text-text-secondary">
              Código de recuperación
            </label>
            <input
              id="recovery-code"
              type="text"
              autoComplete="off"
              autoFocus
              spellCheck={false}
              value={recoveryCode}
              onChange={(e) => {
                setRecoveryCode(e.target.value.trim());
                if (fieldErrors.recoveryCode) setFieldErrors(({ recoveryCode: _r, ...rest }) => rest);
                if (error) setError(null);
              }}
              className={[
                'h-10 w-full rounded-lg border px-3 font-mono text-sm text-text-primary',
                'bg-surface-input outline-none transition-all duration-150 placeholder:text-text-muted placeholder:font-sans',
                fieldErrors.recoveryCode
                  ? 'border-brand-error ring-1 ring-brand-error/20'
                  : 'border-border focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20',
              ].join(' ')}
              placeholder="Pega tu código aquí"
            />
            {fieldErrors.recoveryCode && (
              <p role="alert" className="text-xs text-brand-error">
                {fieldErrors.recoveryCode}
              </p>
            )}
          </div>

          {/* New password */}
          <div className="space-y-1.5">
            <label htmlFor="new-password" className="block text-sm font-medium text-text-secondary">
              Nueva contraseña
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showPwd ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (fieldErrors.newPassword) setFieldErrors(({ newPassword: _n, ...rest }) => rest);
                }}
                className={[
                  'h-10 w-full rounded-lg border px-3 pr-10 text-sm text-text-primary',
                  'bg-surface-input outline-none transition-all duration-150 placeholder:text-text-muted',
                  fieldErrors.newPassword
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
                {showPwd ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
              </button>
            </div>
            {fieldErrors.newPassword && (
              <p role="alert" className="text-xs text-brand-error">
                {fieldErrors.newPassword}
              </p>
            )}
          </div>

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
                Verificando...
              </>
            ) : (
              'Cambiar contraseña'
            )}
          </button>
        </form>

        <div className="border-t border-border pt-5">
          <p className="text-center text-sm text-text-muted">
            <a
              href="/login"
              onClick={(e) => {
                e.preventDefault();
                void navigate({ to: '/login' });
              }}
              className="font-medium text-brand-blue underline-offset-4 hover:underline"
            >
              Volver al inicio de sesión
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
