import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { ROLE_LABELS, secretSchemaFor } from '@sipnato/shared';
import { ApiError } from '@/lib/api-client';
import { useCurrentUser } from '../auth/useCurrentUser';
import { usersApi } from './api';
import { SecretInput, secretLabel } from './SecretInput';

export function MyAccountPage() {
  const me = useCurrentUser();
  const label = secretLabel(me.role);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: usersApi.changeOwnSecret,
    // El servidor cierra todas las sesiones del usuario: hay que volver a entrar.
    onSuccess: () => { window.location.href = '/login'; },
    onError: (err) => {
      setError(err instanceof ApiError && err.code === 'INVALID_CREDENTIALS'
        ? `${label} actual incorrecto${me.role === 'cajero' ? '' : 'a'}.`
        : err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor.');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = secretSchemaFor(me.role).safeParse(next);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Valor inválido'); return; }
    if (next !== confirm) { setError(`Los ${me.role === 'cajero' ? 'PIN' : 'valores'} no coinciden.`); return; }
    mutation.mutate({ currentSecret: current, newSecret: next });
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-8">
      <h1 className="text-xl font-semibold text-text-primary">Mi cuenta</h1>

      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-text-muted">Nombre</dt>
        <dd className="text-text-primary">{me.displayName}</dd>
        <dt className="text-text-muted">Usuario</dt>
        <dd className="text-text-primary">@{me.username}</dd>
        <dt className="text-text-muted">Rol</dt>
        <dd className="text-text-primary">{ROLE_LABELS[me.role]}</dd>
      </dl>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-4 border-t border-border pt-6">
        <h2 className="text-base font-semibold text-text-primary">Cambiar {label.toLowerCase()}</h2>

        <div className="space-y-1.5">
          <label htmlFor="current-secret" className="block text-sm font-medium text-text-secondary">{label} actual</label>
          <SecretInput id="current-secret" role={me.role} value={current} onChange={setCurrent} autoComplete="current-password" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="next-secret" className="block text-sm font-medium text-text-secondary">{label} nuevo{me.role === 'cajero' ? '' : 'a'}</label>
          <SecretInput id="next-secret" role={me.role} value={next} onChange={setNext} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="confirm-secret" className="block text-sm font-medium text-text-secondary">Confirmar</label>
          <SecretInput id="confirm-secret" role={me.role} value={confirm} onChange={setConfirm} />
        </div>

        {error && <p role="alert" className="text-sm text-brand-error">{error}</p>}

        <p className="text-xs text-text-muted">Al guardar se cerrarán tus sesiones abiertas y volverás a iniciar sesión.</p>

        <button
          type="submit"
          disabled={mutation.isPending || !current || !next || !confirm}
          className="flex h-10 items-center gap-1.5 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        >
          {mutation.isPending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />}
          Guardar
        </button>
      </form>
    </div>
  );
}
