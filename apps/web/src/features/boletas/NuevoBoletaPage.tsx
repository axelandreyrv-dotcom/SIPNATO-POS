import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, ChevronLeft, Loader2, Printer } from 'lucide-react';
import { validateOrderFields, type BoletaWithCustomer, type OrderField } from '@sipnato/shared';
import { WhatsAppNotify } from '../../components/WhatsAppNotify';
import { customersApi } from '../customers/api';
import { useBusiness } from '../auth/useCurrentUser';
import { boletasApi } from './api';
import { useBoletaPrint } from './BoletaPrintView';

function Field({
  id,
  label,
  required,
  error,
  hint,
  children,
}: {
  id?: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-secondary">
        {label}
        {required && (
          <span className="ml-1 text-brand-error" aria-label="obligatorio">*</span>
        )}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
      {error && <p className="text-xs text-brand-error" role="alert">{error}</p>}
    </div>
  );
}

function Input({
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-9 w-full rounded-lg border border-border bg-surface-input px-3 text-sm text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20 placeholder:text-text-muted disabled:opacity-50 ${className}`}
    />
  );
}

// Un campo de la orden según su tipo en el perfil del negocio.
function OrderFieldInput({
  field,
  value,
  error,
  onChange,
  onBlur,
}: {
  field: OrderField;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const id = `nb-field-${field.key}`;
  const common = { id, value, onBlur, 'aria-required': field.required, 'aria-invalid': !!error };

  return (
    <Field
      id={id}
      label={field.label}
      required={field.required}
      {...(error ? { error } : {})}
      {...(field.type === 'imei' ? { hint: '15 dígitos' } : {})}
    >
      {field.type === 'select' ? (
        <select
          {...common}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-lg border border-border bg-surface-input px-3 text-sm text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20"
        >
          <option value="">Elegir…</option>
          {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <Input
          {...common}
          type="text"
          inputMode={field.type === 'number' || field.type === 'imei' ? 'numeric' : undefined}
          maxLength={field.type === 'imei' ? 15 : 500}
          onChange={(e) => onChange(field.type === 'imei' ? e.target.value.replace(/\D/g, '').slice(0, 15) : e.target.value)}
          className={field.type === 'imei' ? 'font-mono tabular-nums' : ''}
        />
      )}
      {field.type === 'secret' && value && (
        <div className="flex items-center gap-1.5 rounded-md border border-brand-warning/25 bg-brand-warning/[0.07] px-3 py-1.5">
          <AlertCircle size={12} strokeWidth={1.5} className="shrink-0 text-brand-warning" aria-hidden />
          <span className="text-xs text-text-muted">Este dato no se cifra. Manéjalo con discreción.</span>
        </div>
      )}
    </Field>
  );
}

export function NuevoBoletaPage() {
  const navigate = useNavigate();
  const { printBoleta, printPortal } = useBoletaPrint();
  const [saved, setSaved] = useState<BoletaWithCustomer | null>(null);

  // Customer fields
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [idNumber, setIdNumber] = useState('');

  // Artículo y campos del negocio
  const { itemLabel, ordersLabel, fields: orderFields } = useBusiness();
  const [deviceModel, setDeviceModel] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [description, setDescription] = useState('');

  // Misma validación que aplica el servidor (validateOrderFields).
  const fieldCheck = validateOrderFields(orderFields, fieldValues);
  const fieldErrors = fieldCheck.ok ? {} : fieldCheck.errors;

  // Client-side validation state
  const [phoneError, setPhoneError] = useState('');

  // Lookup customer by phone (fires when phone is exactly 8 digits)
  const phoneLookupEnabled = /^\d{8}$/.test(phone);

  const { data: lookupData, isFetching: lookingUp } = useQuery({
    queryKey: ['customer-lookup', phone],
    queryFn: () => customersApi.lookupByPhone(phone),
    enabled: phoneLookupEnabled,
    staleTime: 30_000,
  });

  // Autofill name when customer found
  useEffect(() => {
    if (!phoneLookupEnabled) return;
    const match = lookupData?.customers.find((c) => c.phone === phone);
    if (match) {
      setName(match.name);
      setEmail(match.email ?? '');
      setIdNumber(match.idNumber ?? '');
    }
  }, [lookupData, phone, phoneLookupEnabled]);

  const foundCustomer = phoneLookupEnabled
    ? lookupData?.customers.find((c) => c.phone === phone) ?? null
    : null;

  function validatePhoneField(v: string) {
    if (v && !/^\d{8}$/.test(v)) setPhoneError('Debe tener exactamente 8 dígitos');
    else setPhoneError('');
  }

  // Los campos obligatorios vacíos no deshabilitan el botón: al enviar se marcan en rojo.
  const canSubmit =
    /^\d{8}$/.test(phone) &&
    name.trim().length > 0 &&
    deviceModel.trim().length > 0 &&
    description.trim().length > 0 &&
    !phoneError;

  const createMutation = useMutation({ mutationFn: boletasApi.create });

  function resetForm() {
    setPhone(''); setName(''); setEmail(''); setIdNumber('');
    setDeviceModel(''); setFieldValues({}); setTouched({}); setSubmitted(false); setDescription('');
    setPhoneError('');
  }

  function handleSubmit(e: React.FormEvent, andPrint: boolean) {
    e.preventDefault();
    setSubmitted(true);
    if (!canSubmit || !fieldCheck.ok || createMutation.isPending) return;

    createMutation.mutate(
      {
        customerPhone: phone,
        customerName: name.trim(),
        customerEmail: email.trim() || undefined,
        customerIdNumber: idNumber.trim() || undefined,
        deviceModel: deviceModel.trim(),
        fields: fieldValues,
        description: description.trim(),
      },
      {
        onSuccess: (boleta) => {
          if (andPrint) {
            printBoleta(boleta);
            setSaved(boleta);
            resetForm();
          } else {
            void navigate({ to: '/boletas' });
          }
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-8">
      {printPortal}
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void navigate({ to: '/boletas' })}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-bg hover:text-text-primary"
          aria-label="Volver"
        >
          <ChevronLeft size={18} strokeWidth={1.5} aria-hidden />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{ordersLabel}: nuevo ingreso</h1>
        </div>
      </div>

      {saved !== null && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-brand-success/30 bg-brand-success/10 px-4 py-3 text-sm">
          <span className="mr-auto text-brand-success">
            #{saved.consecutive} guardado e impreso. Formulario listo para el siguiente.
          </span>
          <WhatsAppNotify
            event="orden_recibida"
            entityType="boleta"
            entityId={saved.id}
            phone={saved.customerPhone}
            vars={{ cliente: saved.customerName, articulo: saved.deviceModel, numero: String(saved.consecutive) }}
            label="Enviar comprobante"
          />
          <button
            type="button"
            onClick={() => void navigate({ to: '/boletas' })}
            className="shrink-0 text-brand-blue hover:underline"
          >
            Ver todos →
          </button>
        </div>
      )}

      <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-8">
        {/* Customer section */}
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">
            Cliente
          </h2>
          <div className="space-y-4 rounded-xl border border-border bg-surface-card p-5">
            <Field id="nb-phone" label="Celular" required error={phoneError}>
              <div className="relative">
                <Input
                  id="nb-phone"
                  type="tel"
                  maxLength={8}
                  value={phone}
                  placeholder="88001234"
                  aria-required="true"
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 8);
                    setPhone(v);
                    validatePhoneField(v);
                  }}
                />
                {phoneLookupEnabled && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {lookingUp ? (
                      <Loader2 size={14} strokeWidth={1.5} className="animate-spin text-text-muted" aria-hidden />
                    ) : foundCustomer ? (
                      <CheckCircle size={14} strokeWidth={1.5} className="text-brand-success" aria-hidden />
                    ) : null}
                  </span>
                )}
              </div>
              {foundCustomer && (
                <p className="text-xs text-brand-success">
                  Cliente existente: {foundCustomer.name}
                </p>
              )}
            </Field>

            <Field id="nb-name" label="Nombre" required>
              <Input
                id="nb-name"
                type="text"
                maxLength={200}
                value={name}
                placeholder="Juan Pérez"
                aria-required="true"
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="nb-email" label="Correo">
                <Input
                  id="nb-email"
                  type="email"
                  maxLength={200}
                  value={email}
                  placeholder="juan@ejemplo.com"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field id="nb-idnumber" label="Cédula / ID" hint="Ej. 1-2345-6789">
                <Input
                  id="nb-idnumber"
                  type="text"
                  maxLength={20}
                  value={idNumber}
                  placeholder="1-2345-6789"
                  onChange={(e) => setIdNumber(e.target.value)}
                />
              </Field>
            </div>
          </div>
        </section>

        {/* Artículo + campos definidos por el negocio */}
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">
            {itemLabel}
          </h2>
          <div className="space-y-4 rounded-xl border border-border bg-surface-card p-5">
            <Field id="nb-model" label={itemLabel} required>
              <Input
                id="nb-model"
                type="text"
                maxLength={200}
                value={deviceModel}
                aria-required="true"
                onChange={(e) => setDeviceModel(e.target.value)}
              />
            </Field>

            {orderFields.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {orderFields.map((f) => (
                  <OrderFieldInput
                    key={f.key}
                    field={f}
                    value={fieldValues[f.key] ?? ''}
                    error={touched[f.key] || submitted ? fieldErrors[f.key] : undefined}
                    onChange={(v) => setFieldValues((prev) => ({ ...prev, [f.key]: v }))}
                    onBlur={() => setTouched((prev) => ({ ...prev, [f.key]: true }))}
                  />
                ))}
              </div>
            )}

            <Field id="nb-description" label="Descripción del problema / trabajo" required>
              <textarea
                id="nb-description"
                maxLength={5000}
                rows={4}
                value={description}
                placeholder="Qué pide el cliente o qué falla presenta"
                aria-required="true"
                onChange={(e) => setDescription(e.target.value)}
                className="w-full resize-y rounded-lg border border-border bg-surface-input px-3 py-2.5 text-sm text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20 placeholder:text-text-muted"
              />
              <span className="self-end text-xs text-text-muted">
                {description.length}/5000
              </span>
            </Field>
          </div>
        </section>

        {/* Submit */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void navigate({ to: '/boletas' })}
            className="flex h-10 flex-1 items-center justify-center rounded-lg border border-border text-sm text-text-secondary transition-colors hover:bg-surface-bg"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSubmit || createMutation.isPending}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-success text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <><Loader2 size={15} strokeWidth={1.5} className="animate-spin" aria-hidden /> Guardando...</>
            ) : (
              'Solo guardar'
            )}
          </button>
          <button
            type="button"
            disabled={!canSubmit || createMutation.isPending}
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent, true)}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-blue text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer size={15} strokeWidth={1.5} aria-hidden />
            Guardar e imprimir
          </button>
        </div>

        {createMutation.isError && (
          <p className="text-center text-xs text-brand-error" role="alert">
            {createMutation.error?.message ?? 'Error al guardar'}
          </p>
        )}
      </form>
    </div>
  );
}
