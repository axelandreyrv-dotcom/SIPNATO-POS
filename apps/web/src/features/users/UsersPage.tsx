import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, Lock, Plus, UserPlus, X } from 'lucide-react';
import {
  createUserSchema,
  manageableRoles,
  ROLE_LABELS,
  type UserRecord,
  type UserRole,
} from '@sipnato/shared';
import { ApiError } from '@/lib/api-client';
import { useCurrentUser } from '../auth/useCurrentUser';
import { usersApi } from './api';
import { SecretInput, secretLabel } from './SecretInput';

const inputCls =
  'h-10 w-full rounded-lg border border-border bg-surface-input px-3 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20';

const ROLE_BADGE: Record<UserRole, string> = {
  dueno: 'bg-brand-blue/10 text-brand-blue',
  admin: 'bg-brand-blue/10 text-brand-blue',
  cajero: 'bg-border text-text-secondary',
};

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor.';
}

// ── Formulario de alta ────────────────────────────────────────────────────────
function CreateUserForm({ roles, onDone }: { roles: UserRole[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>(roles.includes('cajero') ? 'cajero' : roles[0]!);
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      onDone();
    },
    onError: (err) => setError(errorText(err)),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = createUserSchema.safeParse({ displayName, username, role, secret });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    mutation.mutate(parsed.data);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mb-6 rounded-xl border border-border bg-surface-card p-4 sm:p-5"
      aria-label="Nuevo usuario"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="new-display-name"
            className="block text-sm font-medium text-text-secondary"
          >
            Nombre
          </label>
          <input
            id="new-display-name"
            autoFocus
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="María Rojas"
            className={inputCls}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="new-username" className="block text-sm font-medium text-text-secondary">
            Usuario
          </label>
          <input
            id="new-username"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="maria"
            className={inputCls}
          />
        </div>

        {roles.length > 1 && (
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 block text-sm font-medium text-text-secondary">Rol</legend>
            <div className="flex gap-2">
              {roles.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setRole(r);
                    setSecret('');
                  }}
                  aria-pressed={role === r}
                  className={[
                    'flex h-10 flex-1 items-center justify-center rounded-lg border text-sm transition-colors',
                    role === r
                      ? 'border-brand-blue bg-brand-blue/10 font-medium text-brand-blue'
                      : 'border-border text-text-secondary hover:bg-surface-bg',
                  ].join(' ')}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="space-y-1.5">
          <label htmlFor="new-secret" className="block text-sm font-medium text-text-secondary">
            {secretLabel(role)}
          </label>
          <SecretInput id="new-secret" role={role} value={secret} onChange={setSecret} />
        </div>
      </div>

      <p className="mt-3 text-xs text-text-muted">
        {role === 'cajero'
          ? 'Los cajeros entran con usuario y PIN. Pueden vender, abrir y cerrar caja; para eliminar ventas o gastos necesitan la autorización de un administrador.'
          : 'Los administradores gestionan cajeros y pueden eliminar ventas y gastos, y cancelar créditos y apartados.'}
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-brand-error">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="flex h-10 items-center rounded-lg border border-border px-4 text-sm text-text-secondary transition-colors hover:bg-surface-bg"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="flex h-10 items-center gap-1.5 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        >
          {mutation.isPending && (
            <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />
          )}
          Crear usuario
        </button>
      </div>
    </form>
  );
}

// ── Fila de usuario ───────────────────────────────────────────────────────────
function UserRow({
  user,
  canManage,
  isSelf,
}: {
  user: UserRecord;
  canManage: boolean;
  isSelf: boolean;
}) {
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState(false);
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof usersApi.update>[1]) => usersApi.update(user.id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setResetting(false);
      setSecret('');
      setError(null);
    },
    onError: (err) => setError(errorText(err)),
  });

  const status = !user.active
    ? { text: 'Desactivado', cls: 'text-text-muted' }
    : user.locked
      ? { text: 'Bloqueado', cls: 'text-brand-warning' }
      : null;

  return (
    <li className="border-b border-border px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p
            className={[
              'truncate text-sm font-medium',
              user.active ? 'text-text-primary' : 'text-text-muted line-through',
            ].join(' ')}
          >
            {user.displayName}
            {isSelf && <span className="ml-2 text-xs font-normal text-text-muted">(tú)</span>}
          </p>
          <p className="truncate text-xs text-text-muted">@{user.username}</p>
        </div>

        {status && (
          <span className={['flex items-center gap-1 text-xs font-medium', status.cls].join(' ')}>
            {user.locked && user.active && <Lock size={12} strokeWidth={1.5} aria-hidden />}
            {status.text}
          </span>
        )}

        <span
          className={['rounded-full px-2 py-0.5 text-xs font-medium', ROLE_BADGE[user.role]].join(
            ' ',
          )}
        >
          {ROLE_LABELS[user.role]}
        </span>

        {canManage && (
          <div className="flex w-full items-center gap-1 sm:w-auto">
            {user.active && user.locked && (
              <button
                type="button"
                onClick={() => mutation.mutate({ unlock: true })}
                disabled={mutation.isPending}
                className="flex h-9 items-center rounded-lg px-3 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue/10"
              >
                Desbloquear
              </button>
            )}
            {user.active && (
              <button
                type="button"
                onClick={() => {
                  setResetting((v) => !v);
                  setError(null);
                  setSecret('');
                }}
                aria-expanded={resetting}
                className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs text-text-secondary transition-colors hover:bg-surface-bg hover:text-text-primary"
              >
                <KeyRound size={13} strokeWidth={1.5} aria-hidden />
                {user.role === 'cajero' ? 'Cambiar PIN' : 'Cambiar contraseña'}
              </button>
            )}
            <button
              type="button"
              onClick={() => mutation.mutate({ active: !user.active })}
              disabled={mutation.isPending}
              className={[
                'flex h-9 items-center rounded-lg px-3 text-xs transition-colors',
                user.active
                  ? 'text-text-muted hover:bg-brand-error/10 hover:text-brand-error'
                  : 'text-brand-blue hover:bg-brand-blue/10',
              ].join(' ')}
            >
              {user.active ? 'Desactivar' : 'Reactivar'}
            </button>
          </div>
        )}
      </div>

      {resetting && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({ secret });
          }}
          noValidate
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <label htmlFor={`reset-${user.id}`} className="sr-only">
            Nuevo {secretLabel(user.role).toLowerCase()} de {user.displayName}
          </label>
          <div className="flex-1 sm:max-w-xs">
            <SecretInput
              id={`reset-${user.id}`}
              role={user.role}
              value={secret}
              onChange={setSecret}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={mutation.isPending || secret.length === 0}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-60"
            >
              {mutation.isPending && (
                <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />
              )}
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setResetting(false)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-text-muted hover:bg-surface-bg"
              aria-label="Cancelar"
            >
              <X size={16} strokeWidth={1.5} aria-hidden />
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-brand-error">
          {error}
        </p>
      )}
    </li>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────
export function UsersPage() {
  const me = useCurrentUser();
  const roles = manageableRoles(me.role);
  const [creating, setCreating] = useState(false);

  const {
    data: users,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Usuarios</h1>
          <p className="mt-1 text-sm text-text-muted">
            {me.role === 'dueno'
              ? 'Administradores y cajeros del negocio.'
              : 'Cajeros del negocio.'}
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <Plus size={16} strokeWidth={1.5} aria-hidden />
            Nuevo usuario
          </button>
        )}
      </div>

      {creating && <CreateUserForm roles={roles} onDone={() => setCreating(false)} />}

      {isLoading ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-card">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border px-4 py-4 last:border-0"
            >
              <div className="h-4 w-40 animate-pulse rounded bg-border" />
              <div className="ml-auto h-4 w-16 animate-pulse rounded bg-border" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-border bg-surface-card p-6 text-center">
          <p className="text-sm text-text-muted">No se pudieron cargar los usuarios.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 text-sm font-medium text-brand-blue hover:underline"
          >
            Reintentar
          </button>
        </div>
      ) : users && users.length <= 1 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <UserPlus size={28} strokeWidth={1.5} className="text-text-muted" aria-hidden />
          <p className="mt-3 text-sm font-medium text-text-primary">Todavía trabajas solo</p>
          <p className="mt-1 max-w-sm text-sm text-text-muted">
            Crea un usuario para cada persona que atiende. Así cada venta y cada cierre de caja
            queda con su nombre.
          </p>
        </div>
      ) : (
        <ul className="m-0 list-none overflow-hidden rounded-xl border border-border bg-surface-card p-0">
          {users?.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              isSelf={u.id === me.id}
              canManage={u.id !== me.id && roles.includes(u.role)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
