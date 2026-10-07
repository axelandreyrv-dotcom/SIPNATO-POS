import { useEffect, useRef, useState } from 'react';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import type { SupervisorAuth } from '@sipnato/shared';
import { ApiError } from '@/lib/api-client';

// Mensaje para los errores que devuelve el servidor al validar una autorización.
export function supervisorAuthErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'AUTORIZACION_INVALIDA') return 'Usuario o contraseña/PIN incorrectos, o sin permiso para autorizar.';
    if (err.code === 'USUARIO_BLOQUEADO') return 'Ese usuario está bloqueado por intentos fallidos. Espera 15 minutos.';
    return err.message;
  }
  return 'No se pudo conectar con el servidor.';
}

// Un cajero pide a un admin o al dueño que confirme una acción en el momento.
// Las credenciales viajan con la acción misma; no se abre una sesión del supervisor.
export function SupervisorAuthDialog({
  title,
  description,
  onConfirm,
  onClose,
  isLoading,
  error,
}: {
  title: string;
  description: string;
  onConfirm: (auth: SupervisorAuth) => void;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canSubmit = username.trim().length > 0 && secret.length > 0 && !isLoading;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (canSubmit) onConfirm({ username: username.trim().toLowerCase(), secret });
  }

  const inputCls =
    'h-10 w-full rounded-lg border border-border bg-surface-input px-3 text-sm text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="supervisor-auth-title"
        onSubmit={handleSubmit}
        noValidate
        className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl border border-border bg-surface-card p-6 shadow-[0_8px_32px_-4px_oklch(0%_0_0/0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} strokeWidth={1.5} className="text-brand-blue" aria-hidden />
            <h2 id="supervisor-auth-title" className="text-base font-semibold text-text-primary">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-bg hover:text-text-primary"
            aria-label="Cerrar"
          >
            <X size={16} strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        <p className="mb-5 text-sm text-text-muted">{description}</p>

        <div className="mb-5 space-y-3">
          <div>
            <label htmlFor="supervisor-username" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Usuario del administrador
            </label>
            <input
              id="supervisor-username"
              ref={usernameRef}
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="supervisor-secret" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Contraseña o PIN
            </label>
            <input
              id="supervisor-secret"
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className={inputCls}
            />
          </div>
          {error && <p className="text-xs text-brand-error" role="alert">{error}</p>}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex flex-1 h-10 items-center justify-center rounded-lg border border-border text-sm text-text-secondary transition-colors hover:bg-surface-bg"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex flex-1 h-10 items-center justify-center gap-1.5 rounded-lg bg-brand-error text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />}
            Autorizar y eliminar
          </button>
        </div>
      </form>
    </div>
  );
}
