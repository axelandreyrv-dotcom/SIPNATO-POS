import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, KeyRound, Loader2, Printer } from 'lucide-react';
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

function PrintSection({ settings }: { settings: Settings | null }) {
  const [testPrint, setTestPrint] = useState(false);

  useEffect(() => {
    if (!testPrint) return;
    const timer = setTimeout(() => {
      const pageStyle = document.createElement('style');
      pageStyle.textContent = '@media print { @page { size: 80mm auto; margin: 4mm 5mm; } }';
      document.head.appendChild(pageStyle);
      document.body.classList.add('print-sale');
      window.print();
      document.body.classList.remove('print-sale');
      pageStyle.remove();
      setTestPrint(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [testPrint]);

  const shopName = settings?.shop_name?.trim() || 'Dosuxsoft';
  const shopAddress = settings?.shop_address?.trim();
  const shopPhone = settings?.shop_phone?.trim();
  const shopMobile = settings?.shop_mobile?.trim();
  const shopId = settings?.shop_id_number?.trim();
  const footer = settings?.receipt_footer?.trim();
  const now = new Date();
  const date = now.toLocaleDateString('es-CR', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Costa_Rica' });
  const time = now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Costa_Rica' });

  return (
    <Section
      title="Impresora de tickets"
      description="Los tickets se imprimen directamente desde el navegador. Configura la Epson TM-T20II como impresora predeterminada en Windows."
    >
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-brand-success shrink-0" aria-hidden />
        <span className="text-sm text-text-primary">Impresión por navegador activa</span>
      </div>

      <p className="text-sm text-text-muted leading-relaxed">
        En el módulo POS, cada venta tiene un botón de impresora. Al hacer clic se abre el diálogo del navegador — selecciona la Epson y confirma.
      </p>

      <button
        type="button"
        onClick={() => setTestPrint(true)}
        className="flex h-9 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
      >
        <Printer size={14} strokeWidth={1.5} aria-hidden />
        Imprimir ticket de prueba
      </button>

      {testPrint && createPortal(
        <div className="sale-print-overlay" style={{ fontFamily: '"Courier New", Courier, monospace', color: '#000' }}>
          <div style={{ width: '100%', maxWidth: 290, margin: '0 auto', padding: '4px 0', fontSize: 15, lineHeight: 1.55 }}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{shopName}</div>
              {shopId && <div style={{ fontSize: 13 }}>Cédula: {shopId}</div>}
              {shopAddress && <div style={{ fontSize: 13 }}>{shopAddress}</div>}
              {shopPhone && <div style={{ fontSize: 13 }}>Tel: {shopPhone}</div>}
              {shopMobile && <div style={{ fontSize: 13 }}>Cel: {shopMobile}</div>}
            </div>
            <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
            <div style={{ textAlign: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>*** TICKET DE PRUEBA ***</div>
              <div style={{ fontSize: 14 }}>{date} — {time}</div>
            </div>
            <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
            <div style={{ fontSize: 14, marginBottom: 5 }}>Reparación de pantalla Samsung</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 1 }}>
              <span>Método:</span><span>Efectivo</span>
            </div>
            <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>TOTAL</span>
              <span style={{ fontSize: 26, fontWeight: 700 }}>₡25 000</span>
            </div>
            <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
            <div style={{ textAlign: 'center', fontSize: 13 }}>
              {footer
                ? <span style={{ whiteSpace: 'pre-wrap' }}>{footer}</span>
                : <span>Gracias por su compra</span>
              }
            </div>
          </div>
        </div>,
        document.body,
      )}
    </Section>
  );
}

function PinSection({
  pinSet,
  onSuccess,
}: {
  pinSet: boolean;
  onSuccess: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (p: string | null) => settingsApi.setSalesPin(p),
    onSuccess: () => {
      setShowForm(false);
      setPin('');
      setConfirmPin('');
      setFormError(null);
      onSuccess();
    },
    onError: () => {
      setFormError('No se pudo guardar el PIN. Intenta de nuevo.');
    },
  });

  function handleSave() {
    if (pin.length !== 4) { setFormError('El PIN debe tener 4 dígitos.'); return; }
    if (pin !== confirmPin) { setFormError('Los PINes no coinciden.'); return; }
    mutation.mutate(pin);
  }

  function handleClear() {
    mutation.mutate(null);
  }

  const pinInputClass = [
    'h-11 w-full rounded-lg border px-3 text-center text-xl tracking-[0.5em]',
    'bg-surface-input text-text-primary outline-none transition-all duration-150',
    'border-border focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20',
    'placeholder:tracking-normal placeholder:text-sm placeholder:text-text-muted',
  ].join(' ');

  return (
    <Section
      title="PIN de borrado"
      description="Protege la eliminación de ventas con un PIN de 4 dígitos."
    >
      <div className="flex items-center gap-2.5">
        <div
          className={['h-2 w-2 shrink-0 rounded-full', pinSet ? 'bg-brand-success' : 'bg-border'].join(' ')}
          aria-hidden
        />
        <span className="text-sm text-text-primary">
          {pinSet
            ? 'PIN activo — se solicita al eliminar ventas'
            : 'Sin PIN — cualquiera puede eliminar ventas'}
        </span>
      </div>

      {!showForm && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { setShowForm(true); setFormError(null); }}
            className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-text-secondary transition-colors hover:bg-surface-bg hover:text-text-primary"
          >
            <KeyRound size={14} strokeWidth={1.5} aria-hidden />
            {pinSet ? 'Cambiar PIN' : 'Configurar PIN'}
          </button>
          {pinSet && (
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={handleClear}
              className="flex h-9 items-center gap-2 rounded-lg border border-brand-error/30 px-3 text-sm text-brand-error transition-colors hover:bg-brand-error/[0.07] disabled:opacity-50"
            >
              {mutation.isPending
                ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />
                : null}
              Quitar PIN
            </button>
          )}
        </div>
      )}

      {showForm && (
        <div className="space-y-3 rounded-xl border border-border bg-surface-bg p-4">
          <div>
            <FieldLabel htmlFor="new-pin">Nuevo PIN (4 dígitos)</FieldLabel>
            <input
              id="new-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                setFormError(null);
              }}
              placeholder="••••"
              className={pinInputClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="confirm-pin">Confirmar PIN</FieldLabel>
            <input
              id="confirm-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => {
                setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                setFormError(null);
              }}
              placeholder="••••"
              className={pinInputClass}
            />
          </div>
          {formError && (
            <p className="text-xs text-brand-error" role="alert">{formError}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setPin('');
                setConfirmPin('');
                setFormError(null);
              }}
              className="flex h-9 items-center px-3 rounded-lg border border-border text-sm text-text-secondary transition-colors hover:bg-surface-card"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={mutation.isPending || pin.length !== 4 || confirmPin.length !== 4}
              onClick={handleSave}
              className="flex h-9 items-center gap-2 px-4 rounded-lg bg-brand-blue text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {mutation.isPending
                ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden />
                : null}
              Guardar PIN
            </button>
          </div>
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
                placeholder="Taller de Reparación Dosuxsoft"
              />
            </div>
            <div>
              <FieldLabel htmlFor="shop_address">Dirección</FieldLabel>
              <input
                id="shop_address"
                type="text"
                maxLength={200}
                value={current.shop_address}
                onChange={(e) => patch({ shop_address: e.target.value })}
                className={inputClass}
                placeholder="San José, Costa Rica"
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

          {/* ── PIN de borrado ──────────────────────────────────────────── */}
          <PinSection
            pinSet={data?.salesDeletePinSet ?? false}
            onSuccess={() => queryClient.invalidateQueries({ queryKey: ['settings'] })}
          />

          {/* ── Impresora de tickets ────────────────────────────────────── */}
          <PrintSection settings={current} />

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
