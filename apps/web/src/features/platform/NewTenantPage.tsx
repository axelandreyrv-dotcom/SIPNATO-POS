import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { addMonths, createTenantSchema, formatColones, type PlatformTenant } from '@sipnato/shared';
import { platformApi } from './api';
import { Link } from './router';
import { BusinessTypeFields, templateDefaults } from './BusinessTypeFields';
import { SetupCodePanel } from './SetupCodePanel';
import {
  errorText,
  FieldLabel,
  inputClass,
  primaryButton,
  tenantHost,
  textareaClass,
  todayCR,
} from './ui';

// "Taller Doña Ana #2" → "taller-dona-ana-2"
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '');
}

export function NewTenantPage() {
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ['platform-settings'], queryFn: platformApi.settings });

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [billed, setBilled] = useState(true);
  const [paidUntil, setPaidUntil] = useState(() => addMonths(todayCR(), 1));
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [business, setBusiness] = useState(() => templateDefaults('generico'));
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ tenant: PlatformTenant; setupCode: string } | null>(
    null,
  );

  const mutation = useMutation({
    mutationFn: platformApi.createTenant,
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ['platform-tenants'] });
      setCreated(result);
    },
    onError: (err) => setError(errorText(err)),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = createTenantSchema.safeParse({
      slug,
      name,
      contactName,
      contactPhone: contactPhone.replace(/\D/g, ''),
      monthlyPrice: billed && price.trim() ? Number(price.replace(/\D/g, '')) : null,
      paidUntil: billed ? paidUntil : null,
      notes,
      template: business.template,
      modules: business.modules,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos');
      return;
    }
    mutation.mutate(parsed.data);
  }

  if (created) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <BackLink />
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            {created.tenant.name} está listo
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Su base de datos ya existe. Falta que el dueño cree su cuenta con este código.
          </p>
        </div>
        <SetupCodePanel tenant={created.tenant} code={created.setupCode} />
        <div className="flex flex-wrap gap-2">
          <Link to={`/negocios/${created.tenant.slug}`} className={primaryButton}>
            Ver el negocio
          </Link>
        </div>
      </div>
    );
  }

  const defaultPrice = settings.data?.defaultMonthlyPrice;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <BackLink />
      <h1 className="text-xl font-semibold tracking-tight text-text-primary">Nuevo negocio</h1>

      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        <fieldset className="space-y-4">
          <div>
            <FieldLabel htmlFor="nt-name">Nombre del negocio</FieldLabel>
            <input
              id="nt-name"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugEdited) setSlug(slugify(e.target.value));
              }}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="nt-slug">Subdominio</FieldLabel>
            <input
              id="nt-slug"
              value={slug}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase());
                setSlugEdited(true);
              }}
              className={`${inputClass} font-mono`}
              aria-describedby="nt-slug-hint"
            />
            <p id="nt-slug-hint" className="mt-1.5 text-xs text-text-muted">
              {slug ? (
                <>
                  El negocio entrará en{' '}
                  <span className="font-medium text-text-secondary">{tenantHost(slug)}</span>. No se
                  puede cambiar después.
                </>
              ) : (
                'Minúsculas, números y guiones.'
              )}
            </p>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-text-primary">
            Tipo de negocio y módulos
          </legend>
          <BusinessTypeFields idPrefix="nt" value={business} onChange={setBusiness} />
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-sm font-semibold text-text-primary">
            Contacto para el cobro
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="nt-contact">Nombre</FieldLabel>
              <input
                id="nt-contact"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="nt-phone">Celular (WhatsApp)</FieldLabel>
              <input
                id="nt-phone"
                inputMode="numeric"
                maxLength={9}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className={`${inputClass} tabular-nums`}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-sm font-semibold text-text-primary">Mensualidad</legend>
          <div
            className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border"
            role="radiogroup"
          >
            {[
              { value: true, label: 'Se le cobra', hint: 'Recibe avisos al vencer' },
              { value: false, label: 'Sin cobro', hint: 'Negocio propio o cortesía' },
            ].map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                role="radio"
                aria-checked={billed === opt.value}
                onClick={() => setBilled(opt.value)}
                className={[
                  'px-3 py-2.5 text-left transition-colors duration-150',
                  billed === opt.value
                    ? 'bg-brand-blue/10'
                    : 'bg-surface-card hover:bg-brand-blue/[0.04]',
                ].join(' ')}
              >
                <span
                  className={`block text-sm font-medium ${billed === opt.value ? 'text-brand-blue' : 'text-text-primary'}`}
                >
                  {opt.label}
                </span>
                <span className="block text-xs text-text-muted">{opt.hint}</span>
              </button>
            ))}
          </div>

          {billed && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="nt-until">Pagado hasta</FieldLabel>
                <input
                  id="nt-until"
                  type="date"
                  value={paidUntil}
                  onChange={(e) => setPaidUntil(e.target.value)}
                  className={inputClass}
                  aria-describedby="nt-until-hint"
                />
                <p id="nt-until-hint" className="mt-1.5 text-xs text-text-muted">
                  Desde el día siguiente debe la mensualidad.
                </p>
              </div>
              <div>
                <FieldLabel htmlFor="nt-price">Precio especial</FieldLabel>
                <input
                  id="nt-price"
                  inputMode="numeric"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={
                    defaultPrice !== undefined ? `${formatColones(defaultPrice)} (por defecto)` : ''
                  }
                  className={`${inputClass} tabular-nums`}
                />
              </div>
            </div>
          )}
        </fieldset>

        <div>
          <FieldLabel htmlFor="nt-notes">Notas internas</FieldLabel>
          <textarea
            id="nt-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={textareaClass}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-brand-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={mutation.isPending} className={primaryButton}>
          {mutation.isPending && (
            <Loader2 size={16} strokeWidth={1.5} className="animate-spin" aria-hidden />
          )}
          Crear negocio
        </button>
      </form>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
    >
      <ArrowLeft size={16} strokeWidth={1.5} aria-hidden />
      Negocios
    </Link>
  );
}
