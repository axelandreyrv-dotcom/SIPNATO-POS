import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, ChevronLeft, Loader2 } from 'lucide-react';
import { validateImei } from '@sipnato/shared';
import { customersApi } from '../customers/api';
import { boletasApi } from './api';

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

export function NuevoBoletaPage() {
  const navigate = useNavigate();

  // Customer fields
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [idNumber, setIdNumber] = useState('');

  // Device fields
  const [deviceModel, setDeviceModel] = useState('');
  const [imei, setImei] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [description, setDescription] = useState('');

  // Client-side validation state
  const [imeiError, setImeiError] = useState('');
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

  function validateImeiField(v: string) {
    if (!v) { setImeiError(''); return; }
    if (!/^\d{15}$/.test(v)) { setImeiError('El IMEI debe tener 15 dígitos'); return; }
    if (!validateImei(v)) { setImeiError('IMEI inválido (falla Luhn)'); return; }
    setImeiError('');
  }

  const canSubmit =
    /^\d{8}$/.test(phone) &&
    name.trim().length > 0 &&
    deviceModel.trim().length > 0 &&
    description.trim().length > 0 &&
    !imeiError &&
    !phoneError;

  const createMutation = useMutation({
    mutationFn: boletasApi.create,
    onSuccess: () => {
      void navigate({ to: '/boletas' });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    createMutation.mutate({
      customerPhone: phone,
      customerName: name.trim(),
      customerEmail: email.trim() || undefined,
      customerIdNumber: idNumber.trim() || undefined,
      deviceModel: deviceModel.trim(),
      imei: imei.trim() || undefined,
      unlockPassword: unlockPassword.trim() || undefined,
      description: description.trim(),
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void navigate({ to: '/boletas' })}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-bg hover:text-text-primary"
          aria-label="Volver a boletas"
        >
          <ChevronLeft size={18} strokeWidth={1.5} aria-hidden />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Nueva boleta</h1>
          <p className="mt-0.5 text-sm text-text-muted">Registro de ingreso de equipo.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
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

        {/* Device section */}
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">
            Equipo
          </h2>
          <div className="space-y-4 rounded-xl border border-border bg-surface-card p-5">
            <Field id="nb-model" label="Modelo" required>
              <Input
                id="nb-model"
                type="text"
                maxLength={200}
                value={deviceModel}
                placeholder="Samsung Galaxy A54"
                aria-required="true"
                onChange={(e) => setDeviceModel(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="nb-imei" label="IMEI" error={imeiError} hint="15 dígitos (opcional)">
                <Input
                  id="nb-imei"
                  type="text"
                  maxLength={15}
                  value={imei}
                  placeholder="353879234498174"
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 15);
                    setImei(v);
                    validateImeiField(v);
                  }}
                />
              </Field>
              <Field
                id="nb-password"
                label="Contraseña de desbloqueo"
                hint="Código PIN o patrón — no se almacena de forma segura"
              >
                <div className="relative">
                  <Input
                    id="nb-password"
                    type="text"
                    maxLength={100}
                    value={unlockPassword}
                    placeholder="1234"
                    onChange={(e) => setUnlockPassword(e.target.value)}
                  />
                </div>
                {unlockPassword && (
                  <div className="flex items-center gap-1.5 rounded-md border border-brand-warning/25 bg-brand-warning/[0.07] px-3 py-1.5">
                    <AlertCircle size={12} strokeWidth={1.5} className="shrink-0 text-brand-warning" aria-hidden />
                    <span className="text-xs text-text-muted">
                      Este dato no se cifra. Manéjalo con discreción.
                    </span>
                  </div>
                )}
              </Field>
            </div>

            <Field id="nb-description" label="Descripción del problema / trabajo" required>
              <textarea
                id="nb-description"
                maxLength={5000}
                rows={4}
                value={description}
                placeholder="Pantalla rota, no enciende, batería dañada..."
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
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-blue text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <><Loader2 size={15} strokeWidth={1.5} className="animate-spin" aria-hidden /> Guardando...</>
            ) : (
              'Crear boleta'
            )}
          </button>
        </div>

        {createMutation.isError && (
          <p className="text-center text-xs text-brand-error" role="alert">
            {createMutation.error?.message ?? 'Error al crear la boleta'}
          </p>
        )}
      </form>
    </div>
  );
}
