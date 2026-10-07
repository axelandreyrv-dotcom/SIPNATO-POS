import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  DEFAULT_REMINDER_MESSAGE,
  platformChangePasswordSchema,
  platformSettingsSchema,
  REMINDER_VARIABLES,
  type PlatformSettings,
} from '@sipnato/shared';
import { Section } from '../settings/ui';
import { platformApi } from './api';
import { errorText, FieldLabel, inputClass, primaryButton, textareaClass } from './ui';

export function SettingsPage() {
  const { data, error } = useQuery({ queryKey: ['platform-settings'], queryFn: platformApi.settings });

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold tracking-tight text-text-primary">Configuración</h1>
      {error && <p className="mt-4 text-sm text-brand-error">{errorText(error)}</p>}
      <div className="divide-y divide-border">
        {data ? <BillingForm initial={data} /> : !error && <div className="my-8 h-64 animate-pulse rounded-xl bg-border/40" />}
        <PasswordForm />
      </div>
    </div>
  );
}

function BillingForm({ initial }: { initial: PlatformSettings }) {
  const client = useQueryClient();
  const [price, setPrice] = useState(String(initial.defaultMonthlyPrice));
  const [instructions, setInstructions] = useState(initial.paymentInstructions);
  const [reminder, setReminder] = useState(initial.reminderMessage);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const mutation = useMutation({
    mutationFn: platformApi.saveSettings,
    onSuccess: (saved) => {
      client.setQueryData(['platform-settings'], saved);
      void client.invalidateQueries({ queryKey: ['platform-tenants'] });
      setMessage({ ok: true, text: 'Guardado.' });
    },
    onError: (err) => setMessage({ ok: false, text: errorText(err) }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = platformSettingsSchema.safeParse({
      defaultMonthlyPrice: Number(price.replace(/\D/g, '') || 'NaN'),
      paymentInstructions: instructions,
      // Igual al texto original = sin personalizar: vacío hace que el servidor use el original.
      reminderMessage: reminder.trim() === DEFAULT_REMINDER_MESSAGE ? '' : reminder,
    });
    if (!parsed.success) {
      setMessage({ ok: false, text: parsed.error.issues[0]?.message ?? 'Revisa los datos' });
      return;
    }
    mutation.mutate(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Section title="Cobro" description="Precio para los negocios sin precio especial y lo que ven en su aviso de vencimiento.">
        <div className="max-w-48">
          <FieldLabel htmlFor="ps-price">Mensualidad por defecto (₡)</FieldLabel>
          <input id="ps-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputClass} tabular-nums`} />
        </div>
        <div>
          <FieldLabel htmlFor="ps-instructions">Cómo pagar</FieldLabel>
          <textarea
            id="ps-instructions"
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={'SINPE Móvil 8888-8888 a nombre de …\nEnvíe el comprobante por WhatsApp.'}
            className={textareaClass}
          />
          <p className="mt-1.5 text-xs text-text-muted">El dueño y los administradores lo ven cuando la mensualidad está por vencer o vencida.</p>
        </div>
      </Section>

      <Section title="Recordatorio por WhatsApp" description="Mensaje que abre el botón Recordar cobro de cada negocio.">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="ps-reminder" className="text-sm font-medium text-text-secondary">Mensaje</label>
            <button type="button" onClick={() => setReminder(DEFAULT_REMINDER_MESSAGE)} className="text-xs text-brand-blue hover:underline">
              Restaurar el original
            </button>
          </div>
          <textarea id="ps-reminder" rows={5} value={reminder} onChange={(e) => setReminder(e.target.value)} className={textareaClass} />
          <p className="mt-1.5 text-xs text-text-muted">
            Variables: {REMINDER_VARIABLES.map((v) => <code key={v} className="mr-1.5 font-mono text-text-secondary">{`{${v}}`}</code>)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={mutation.isPending} className={primaryButton}>
            {mutation.isPending && <Loader2 size={16} strokeWidth={1.5} className="animate-spin" aria-hidden />}
            Guardar
          </button>
          {message && <p role="status" className={`text-sm ${message.ok ? 'text-text-secondary' : 'text-brand-error'}`}>{message.text}</p>}
        </div>
      </Section>
    </form>
  );
}

function PasswordForm() {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const mutation = useMutation({
    mutationFn: platformApi.changePassword,
    onSuccess: () => {
      setCurrent('');
      setNew('');
      setConfirm('');
      setMessage({ ok: true, text: 'Contraseña cambiada. Se cerraron tus otras sesiones.' });
    },
    onError: (err) => setMessage({ ok: false, text: errorText(err) }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = platformChangePasswordSchema.safeParse({ currentPassword, newPassword, confirmPassword });
    if (!parsed.success) {
      setMessage({ ok: false, text: parsed.error.issues[0]?.message ?? 'Revisa los datos' });
      return;
    }
    mutation.mutate(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Section title="Mi contraseña" description="Al cambiarla se cierran tus sesiones en otros dispositivos.">
        <div className="grid max-w-md gap-4">
          <div>
            <FieldLabel htmlFor="pp-current">Contraseña actual</FieldLabel>
            <input id="pp-current" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
          </div>
          <div>
            <FieldLabel htmlFor="pp-new">Contraseña nueva</FieldLabel>
            <input id="pp-new" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} className={inputClass} />
          </div>
          <div>
            <FieldLabel htmlFor="pp-confirm">Repetir contraseña nueva</FieldLabel>
            <input id="pp-confirm" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={mutation.isPending} className={primaryButton}>
            {mutation.isPending && <Loader2 size={16} strokeWidth={1.5} className="animate-spin" aria-hidden />}
            Cambiar contraseña
          </button>
          {message && <p role="status" className={`text-sm ${message.ok ? 'text-text-secondary' : 'text-brand-error'}`}>{message.text}</p>}
        </div>
      </Section>
    </form>
  );
}
