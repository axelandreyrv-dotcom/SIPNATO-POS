import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { UserRole } from '@sipnato/shared';

// Contraseña para dueño/admin, PIN numérico de 6 dígitos para cajeros.
export function SecretInput({
  id,
  role,
  value,
  onChange,
  autoComplete = 'new-password',
  invalid = false,
}: {
  id: string;
  role: UserRole;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  invalid?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const isPin = role === 'cajero';

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        {...(isPin ? { inputMode: 'numeric' as const, maxLength: 6 } : {})}
        value={value}
        onChange={(e) =>
          onChange(isPin ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value)
        }
        placeholder={isPin ? '6 dígitos' : 'Mínimo 8 caracteres'}
        className={[
          'h-10 w-full rounded-lg border bg-surface-input px-3 pr-10 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted',
          isPin ? 'tabular-nums tracking-[0.3em] placeholder:tracking-normal' : '',
          invalid
            ? 'border-brand-error ring-1 ring-brand-error/20'
            : 'border-border focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20',
        ].join(' ')}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition-colors hover:text-text-secondary"
        aria-label={visible ? 'Ocultar' : 'Mostrar'}
      >
        {visible ? (
          <EyeOff size={16} strokeWidth={1.5} aria-hidden />
        ) : (
          <Eye size={16} strokeWidth={1.5} aria-hidden />
        )}
      </button>
    </div>
  );
}

export function secretLabel(role: UserRole): string {
  return role === 'cajero' ? 'PIN' : 'Contraseña';
}
