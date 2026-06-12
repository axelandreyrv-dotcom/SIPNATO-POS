import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Copy, Loader2, Printer, Wifi, WifiOff } from 'lucide-react';
import type { Settings } from '@sipnato/shared';
import { settingsApi } from './api';
import { printApi } from '../print/api';

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

function PrintBridgeSection() {
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['print', 'status'],
    queryFn: printApi.getStatus,
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  });

  const generateMutation = useMutation({
    mutationFn: printApi.generateToken,
    onSuccess: (data) => {
      setRevealedToken(data.token);
      void refetchStatus();
    },
  });

  const testMutation = useMutation({
    mutationFn: printApi.testPrint,
  });

  function handleCopy() {
    if (!revealedToken) return;
    void navigator.clipboard.writeText(revealedToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const isConnected = status?.connected ?? false;
  const tokenSet = status?.tokenSet ?? false;
  const serverUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/print`;

  return (
    <Section
      title="Puente de impresión"
      description="Conecta la ticketera física (Epson TM-T20/T88) a través del servicio local print-bridge."
    >
      {/* Status row */}
      <div className="flex items-center gap-2 py-1">
        {isConnected ? (
          <Wifi size={15} strokeWidth={1.5} className="text-brand-success shrink-0" aria-hidden />
        ) : (
          <WifiOff size={15} strokeWidth={1.5} className="text-text-muted shrink-0" aria-hidden />
        )}
        <span className="text-sm text-text-primary">
          {isConnected ? 'Impresora conectada' : tokenSet ? 'Esperando conexión del bridge' : 'Sin configurar'}
        </span>
      </div>

      {/* Server URL for the bridge */}
      <div>
        <FieldLabel htmlFor="bridge-url">URL del servidor (para print-bridge)</FieldLabel>
        <div className="flex items-center gap-2">
          <input
            id="bridge-url"
            type="text"
            readOnly
            value={serverUrl}
            className="h-9 flex-1 rounded-lg border border-border bg-surface-bg px-3 text-sm text-text-muted font-mono outline-none select-all"
          />
        </div>
      </div>

      {/* Token generation */}
      <div>
        <p className="text-sm font-medium text-text-secondary mb-2">Token de autenticación</p>
        {revealedToken ? (
          <div className="rounded-lg border border-brand-warning/30 bg-brand-warning/[0.06] p-3 space-y-2">
            <p className="text-xs text-brand-warning font-medium">Copia este token ahora — no se mostrará de nuevo.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-surface-bg px-2 py-1.5 text-xs font-mono text-text-primary break-all">
                {revealedToken}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:bg-surface-bg hover:text-text-primary"
                aria-label="Copiar token"
              >
                {copied ? (
                  <CheckCircle size={14} strokeWidth={1.5} className="text-brand-success" aria-hidden />
                ) : (
                  <Copy size={14} strokeWidth={1.5} aria-hidden />
                )}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            {tokenSet ? 'Token configurado. Genera uno nuevo para reemplazarlo.' : 'Genera un token para conectar el bridge.'}
          </p>
        )}

        <button
          type="button"
          disabled={generateMutation.isPending}
          onClick={() => generateMutation.mutate()}
          className={[
            'mt-3 flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium',
            'border border-brand-error/30 text-brand-error',
            'transition-colors hover:bg-brand-error/[0.06]',
            'disabled:cursor-not-allowed disabled:opacity-60',
          ].join(' ')}
        >
          {generateMutation.isPending ? (
            <Loader2 size={13} strokeWidth={1.5} className="animate-spin" aria-hidden />
          ) : null}
          {tokenSet ? 'Rotar token' : 'Generar token'}
        </button>
        {generateMutation.isError && (
          <p className="mt-1.5 text-xs text-brand-error">No se pudo generar el token. Intenta de nuevo.</p>
        )}
      </div>

      {/* Test print */}
      {isConnected && (
        <div>
          <button
            type="button"
            disabled={testMutation.isPending}
            onClick={() => testMutation.mutate()}
            className={[
              'flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white',
              'bg-brand-blue transition-all hover:brightness-110 active:scale-[0.98]',
              'disabled:cursor-not-allowed disabled:opacity-60',
            ].join(' ')}
          >
            <Printer size={14} strokeWidth={1.5} aria-hidden />
            {testMutation.isPending ? 'Enviando...' : 'Imprimir prueba'}
          </button>
          {testMutation.isSuccess && (
            <p className="mt-1.5 text-xs text-brand-success flex items-center gap-1">
              <CheckCircle size={12} strokeWidth={1.5} aria-hidden />
              Trabajo de prueba enviado
            </p>
          )}
        </div>
      )}
    </Section>
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
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        <div className="mb-2">
          <div className="h-5 w-32 animate-pulse rounded bg-border" />
          <div className="mt-2 h-3 w-48 animate-pulse rounded bg-border" />
        </div>
        <div className="mt-6 divide-y divide-border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse py-8 sm:grid sm:grid-cols-3 sm:gap-8">
              <div className="space-y-2.5">
                <div className="h-3.5 w-28 rounded bg-border" />
                <div className="h-2.5 w-44 rounded bg-border" />
                <div className="h-2.5 w-36 rounded bg-border" />
              </div>
              <div className="mt-6 space-y-4 sm:col-span-2 sm:mt-0">
                <div>
                  <div className="mb-1.5 h-3 w-24 rounded bg-border" />
                  <div className="h-9 w-full rounded-lg bg-border" />
                </div>
                <div>
                  <div className="mb-1.5 h-3 w-20 rounded bg-border" />
                  <div className="h-9 w-full rounded-lg bg-border" />
                </div>
              </div>
            </div>
          ))}
        </div>
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
            <div>
              <FieldLabel htmlFor="shop_mobile">Celular</FieldLabel>
              <input
                id="shop_mobile"
                type="text"
                maxLength={20}
                value={current.shop_mobile}
                onChange={(e) => patch({ shop_mobile: e.target.value })}
                className={inputClass}
                placeholder="6666-6666"
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

          {/* ── Puente de impresión ─────────────────────────────────────── */}
          <PrintBridgeSection />

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
              <CheckCircle size={15} strokeWidth={1.5} aria-hidden />
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
                <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />
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
