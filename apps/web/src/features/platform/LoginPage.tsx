import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { platformLoginSchema } from '@sipnato/shared';
import { platformApi } from './api';
import { errorText, FieldLabel, inputClass, primaryButton } from './ui';

export function LoginPage() {
  const client = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = platformLoginSchema.safeParse({ username, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Completa los campos.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await platformApi.login(parsed.data);
      await client.resetQueries({ queryKey: ['platform-me'] });
    } catch (err) {
      setError(errorText(err));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-surface-bg px-6 py-12">
      <div className="w-full max-w-[340px]">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-navy">
            <img src="/logo.png" alt="" width={22} height={22} aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight text-text-primary">Dosuxsoft</p>
            <p className="text-xs text-text-muted">Panel de la plataforma</p>
          </div>
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Iniciar sesión</h1>

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
          <div>
            <FieldLabel htmlFor="pa-user">Usuario</FieldLabel>
            <input
              id="pa-user"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`${inputClass} h-10`}
            />
          </div>
          <div>
            <FieldLabel htmlFor="pa-pass">Contraseña</FieldLabel>
            <input
              id="pa-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} h-10`}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-brand-error">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className={`${primaryButton} h-10 w-full`}>
            {loading && (
              <Loader2 size={16} strokeWidth={1.5} className="animate-spin" aria-hidden />
            )}
            Entrar
          </button>
        </form>

        <p className="mt-8 text-xs leading-relaxed text-text-muted">
          Las cuentas del panel se crean en el servidor con{' '}
          <code className="font-mono">superadmin create</code>.
        </p>
      </div>
    </div>
  );
}
