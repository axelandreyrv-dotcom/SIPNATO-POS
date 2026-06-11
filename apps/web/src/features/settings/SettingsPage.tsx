import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Loader2 } from 'lucide-react';
import type { Settings } from '@sipnato/shared';
import { settingsApi } from './api';

const inputClass = [
  'h-9 w-full rounded-lg border px-3 text-sm text-text-primary',
  'bg-surface-input outline-none transition-all duration-150',
  'border-border focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20',
  'placeholder:text-text-muted',
].join(' ');

const textareaClass = [
  'w-full rounded-lg border px-3 py-2 text-sm text-text-primary',
  'bg-surface-input outline-none transition-all duration-150 resize-none',
  'border-border focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20',
  'placeholder:text-text-muted',
].join(' ');

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-text-secondary mb-1.5">
      {children}
    </label>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-8 sm:grid sm:grid-cols-3 sm:gap-8">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <p className="mt-1 text-sm text-text-muted leading-relaxed">{description}</p>
      </div>
      <div className="mt-6 sm:col-span-2 sm:mt-0 space-y-4">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
    staleTime: 5 * 60 * 1000,
  });

  const [form, setForm] = useState<Settings | null>(null);

  // Initialize form once data is loaded
  const current = form ?? data ?? null;

  const mutation = useMutation({
    mutationFn: settingsApi.update,
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      setForm(null); // Reset local overrides — server is source of truth
      setSaved(true);
      setSaveError(null);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: () => {
      setSaveError('No se pudieron guardar los cambios. Intenta de nuevo.');
    },
  });

  function patch(changes: Partial<Settings>) {
    setForm((prev) => ({ ...(prev ?? data!), ...changes }));
    setSaved(false);
    setSaveError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    mutation.mutate(current);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <Loader2 size={20} strokeWidth={1.5} className="animate-spin text-text-muted" />
      </div>
    );
  }

  if (isError || !current) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <p className="text-sm text-brand-error">
          No se pudo cargar la configuración. Verifica que el servidor esté activo.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-xl font-semibold text-text-primary">Configuración</h1>
        <p className="mt-1 text-sm text-text-muted">Ajustes del taller y del sistema.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="divide-y divide-border">
          {/* ── Datos del taller ────────────────────────────────────────── */}
          <Section
            title="Datos del taller"
            description="Información visible en los tickets y documentos impresos."
          >
            <div>
              <FieldLabel htmlFor="shop_name">Nombre del taller</FieldLabel>
              <input
                id="shop_name"
                type="text"
                maxLength={100}
                value={current.shop_name}
                onChange={(e) => patch({ shop_name: e.target.value })}
                className={inputClass}
                placeholder="Taller de Reparación SIPNATO"
              />
            </div>
            <div>
              <FieldLabel htmlFor="shop_id_number">Cédula jurídica</FieldLabel>
              <input
                id="shop_id_number"
                type="text"
                maxLength={20}
                value={current.shop_id_number}
                onChange={(e) => patch({ shop_id_number: e.target.value })}
                className={inputClass}
                placeholder="3-101-000000"
              />
            </div>
            <div>
              <FieldLabel htmlFor="shop_phone">Teléfono</FieldLabel>
              <input
                id="shop_phone"
                type="text"
                maxLength={20}
                value={current.shop_phone}
                onChange={(e) => patch({ shop_phone: e.target.value })}
                className={inputClass}
                placeholder="8888-8888"
              />
            </div>
          </Section>

          {/* ── Leyendas de tickets ─────────────────────────────────────── */}
          <Section
            title="Leyendas de tickets"
            description="Texto al pie de cada tipo de documento. Puede incluir políticas, agradecimientos o notas legales."
          >
            <div>
              <FieldLabel htmlFor="receipt_footer">Pie de ventas</FieldLabel>
              <textarea
                id="receipt_footer"
                rows={3}
                maxLength={500}
                value={current.receipt_footer}
                onChange={(e) => patch({ receipt_footer: e.target.value })}
                className={textareaClass}
                placeholder="Gracias por su compra. No se aceptan devoluciones."
              />
            </div>
            <div>
              <FieldLabel htmlFor="boleta_footer">Pie de boletas de servicio</FieldLabel>
              <textarea
                id="boleta_footer"
                rows={3}
                maxLength={500}
                value={current.boleta_footer}
                onChange={(e) => patch({ boleta_footer: e.target.value })}
                className={textareaClass}
                placeholder="El equipo será retenido 30 días si no es reclamado."
              />
            </div>
            <div>
              <FieldLabel htmlFor="quote_footer">Pie de cotizaciones</FieldLabel>
              <textarea
                id="quote_footer"
                rows={3}
                maxLength={500}
                value={current.quote_footer}
                onChange={(e) => patch({ quote_footer: e.target.value })}
                className={textareaClass}
                placeholder="Cotización válida por 15 días a partir de la fecha de emisión."
              />
            </div>
          </Section>

          {/* ── Cierre automático ───────────────────────────────────────── */}
          <Section
            title="Cierre automático"
            description="Cierra la caja activa automáticamente a la hora programada sin intervención manual."
          >
            <div className="flex items-start gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={current.auto_close_enabled}
                onClick={() => patch({ auto_close_enabled: !current.auto_close_enabled })}
                className={[
                  'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40',
                  current.auto_close_enabled ? 'bg-brand-blue' : 'bg-border',
                ].join(' ')}
                aria-label="Activar cierre automático"
              >
                <span
                  className={[
                    'block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
                    current.auto_close_enabled ? 'translate-x-4' : 'translate-x-0',
                  ].join(' ')}
                />
              </button>
              <div>
                <p className="text-sm font-medium text-text-primary">Activar cierre automático</p>
                <p className="text-xs text-text-muted mt-0.5">
                  La caja se cerrará automáticamente a la hora indicada.
                </p>
              </div>
            </div>

            {current.auto_close_enabled && (
              <div>
                <FieldLabel htmlFor="auto_close_time">Hora de cierre</FieldLabel>
                <input
                  id="auto_close_time"
                  type="time"
                  value={current.auto_close_time}
                  onChange={(e) => patch({ auto_close_time: e.target.value })}
                  className="h-9 rounded-lg border border-border bg-surface-input px-3 text-sm text-text-primary outline-none transition-all duration-150 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20"
                />
              </div>
            )}
          </Section>
        </div>

        {/* ── Footer: save ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 py-6 border-t border-border">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-brand-success">
              <CheckCircle size={15} strokeWidth={2} />
              Guardado
            </span>
          )}
          {saveError && (
            <span className="text-sm text-brand-error">{saveError}</span>
          )}
          <button
            type="submit"
            disabled={mutation.isPending}
            className={[
              'flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white',
              'bg-brand-blue transition-all duration-150',
              'hover:brightness-110 active:scale-[0.98]',
              'disabled:cursor-not-allowed disabled:opacity-60',
            ].join(' ')}
          >
            {mutation.isPending ? (
              <>
                <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                Guardando...
              </>
            ) : (
              'Guardar cambios'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
