import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, KeyRound, Loader2, MessageCircle, Plus } from 'lucide-react';
import {
  addMonths,
  formatColones,
  recordPaymentSchema,
  renderMessage,
  SUBSCRIPTION_PAYMENT_METHOD_LABELS,
  SUBSCRIPTION_PAYMENT_METHODS,
  updateTenantSchema,
  whatsappLink,
  type PlatformAuditEntry,
  type PlatformTenant,
  type PlatformTenantDetail,
  type SubscriptionPayment,
  type SubscriptionPaymentMethod,
} from '@sipnato/shared';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { platformApi } from './api';
import { Link } from './router';
import { SetupCodePanel } from './SetupCodePanel';
import {
  dangerButton,
  dueText,
  errorText,
  FieldLabel,
  inputClass,
  primaryButton,
  secondaryButton,
  SubscriptionBadge,
  SuspendedBadge,
  tenantHost,
  tenantUrl,
  textareaClass,
  todayCR,
} from './ui';

function useInvalidate(slug: string) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ['platform-tenant', slug] });
    void client.invalidateQueries({ queryKey: ['platform-tenants'] });
  };
}

export function TenantDetailPage({ slug }: { slug: string }) {
  const { data, isPending, error } = useQuery({
    queryKey: ['platform-tenant', slug],
    queryFn: () => platformApi.tenant(slug),
  });

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary">
        <ArrowLeft size={16} strokeWidth={1.5} aria-hidden />
        Negocios
      </Link>
      {error ? (
        <p className="text-sm text-brand-error">{errorText(error)}</p>
      ) : isPending ? (
        <div className="space-y-4">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-border/60" />
          <div className="h-20 animate-pulse rounded-xl bg-border/40" />
        </div>
      ) : (
        <Detail detail={data} />
      )}
    </div>
  );
}

function Detail({ detail }: { detail: PlatformTenantDetail }) {
  const t = detail.tenant;
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">{t.name}</h1>
            {t.status === 'suspended' && <SuspendedBadge />}
          </div>
          <a
            href={tenantUrl(t.slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-sm text-brand-blue hover:underline"
          >
            {tenantHost(t.slug)}
            <ExternalLink size={14} strokeWidth={1.5} aria-hidden />
          </a>
        </div>
        <ReminderButton tenant={t} />
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        <Fact label="Suscripción">
          <span className="flex flex-wrap items-center gap-2">
            <SubscriptionBadge status={t.subscription} />
          </span>
        </Fact>
        <Fact label="Pagado hasta">
          {t.paidUntil ? fmtDate(t.paidUntil) : '—'}
          <span className={`block text-xs font-normal ${t.subscription === 'vencido' ? 'text-brand-error' : 'text-text-muted'}`}>{dueText(t)}</span>
        </Fact>
        <Fact label="Mensualidad">
          {t.subscription === 'sin_cobro' ? '—' : formatColones(t.effectivePrice)}
          <span className="block text-xs font-normal text-text-muted">{t.monthlyPrice !== null ? 'Precio especial' : 'Precio por defecto'}</span>
        </Fact>
        <Fact label="Uso">
          {detail.usage.users} {detail.usage.users === 1 ? 'usuario' : 'usuarios'}
          <span className="block text-xs font-normal text-text-muted">
            {detail.usage.lastSaleAt ? `Última venta ${fmtDateTime(detail.usage.lastSaleAt)}` : 'Sin ventas'}
          </span>
        </Fact>
      </dl>

      <div className="divide-y divide-border">
        <Block title="Pagos" description="Cada pago extiende el vencimiento actual, aunque ya haya pasado: el atraso también se cobra.">
          <Payments tenant={t} payments={detail.payments} />
        </Block>
        <Block title="Datos" description="Contacto para el cobro, precio y vencimiento. Corregir la fecha a mano queda en la actividad.">
          {/* Se reinicia si un pago cambia el vencimiento: guardar con la fecha vieja lo desharía. */}
          <TenantForm key={t.paidUntil ?? 'sin-cobro'} tenant={t} />
        </Block>
        <Block title="Acceso" description="Activación de la cuenta del dueño y suspensión del negocio.">
          <Access tenant={t} />
        </Block>
        <Block title="Actividad" description="Cambios hechos desde este panel.">
          <Activity entries={detail.activity} />
        </Block>
      </div>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-card px-4 py-3">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-text-primary">{children}</dd>
    </div>
  );
}

function Block({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="py-8 lg:grid lg:grid-cols-3 lg:gap-8">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <p className="mt-1 max-w-xs text-sm leading-relaxed text-text-muted">{description}</p>
      </div>
      <div className="mt-5 lg:col-span-2 lg:mt-0">{children}</div>
    </section>
  );
}

// ─── Recordatorio por WhatsApp ────────────────────────────────────────────────

function ReminderButton({ tenant: t }: { tenant: PlatformTenant }) {
  const settings = useQuery({ queryKey: ['platform-settings'], queryFn: platformApi.settings });
  if (t.subscription === 'sin_cobro' || !settings.data) return null;

  const message = renderMessage(settings.data.reminderMessage, {
    contacto: t.contactName || '',
    negocio: t.name,
    monto: formatColones(t.effectivePrice),
    vence: t.paidUntil ? fmtDate(t.paidUntil) : '',
    instrucciones: settings.data.paymentInstructions,
  });

  return (
    <a
      href={whatsappLink(t.contactPhone, message)}
      target="_blank"
      rel="noopener noreferrer"
      className={secondaryButton}
      title={t.contactPhone ? undefined : 'Sin celular: WhatsApp pedirá elegir el contacto'}
    >
      <MessageCircle size={16} strokeWidth={1.5} aria-hidden />
      Recordar cobro
    </a>
  );
}

// ─── Pagos ────────────────────────────────────────────────────────────────────

const MONTH_OPTIONS = [1, 2, 3, 6, 12];

function Payments({ tenant, payments }: { tenant: PlatformTenant; payments: SubscriptionPayment[] }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {open ? (
        <PaymentForm
          tenant={tenant}
          onDone={(paidUntil) => {
            setOpen(false);
            setNotice(paidUntil ? `Pago registrado. Queda pagado hasta el ${fmtDate(paidUntil)}.` : null);
          }}
        />
      ) : (
        <button type="button" onClick={() => { setOpen(true); setNotice(null); }} className={primaryButton}>
          <Plus size={16} strokeWidth={1.5} aria-hidden />
          Registrar pago
        </button>
      )}

      {notice && <p role="status" className="text-sm text-brand-success">{notice}</p>}

      {payments.length === 0 ? (
        <p className="text-sm text-text-muted">Todavía no hay pagos registrados.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-card">
          {payments.map((p) => (
            <PaymentRow key={p.id} slug={tenant.slug} payment={p} onVoided={setNotice} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PaymentForm({ tenant, onDone }: { tenant: PlatformTenant; onDone: (paidUntil: string | null) => void }) {
  const invalidate = useInvalidate(tenant.slug);
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(String(tenant.effectivePrice));
  const [amountEdited, setAmountEdited] = useState(false);
  const [method, setMethod] = useState<SubscriptionPaymentMethod>('sinpe');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState(todayCR);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const newPaidUntil = addMonths(tenant.paidUntil ?? todayCR(), months);

  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof platformApi.recordPayment>[1]) => platformApi.recordPayment(tenant.slug, body),
    onSuccess: ({ tenant: updated }) => {
      invalidate();
      onDone(updated.paidUntil);
    },
    onError: (err) => setError(errorText(err)),
  });

  function pickMonths(n: number) {
    setMonths(n);
    if (!amountEdited) setAmount(String(n * tenant.effectivePrice));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = recordPaymentSchema.safeParse({
      amount: Number(amount.replace(/\D/g, '') || 'NaN'),
      months,
      method,
      reference,
      paidAt,
      notes,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos');
      return;
    }
    setError(null);
    mutation.mutate(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4 rounded-xl border border-border bg-surface-card p-4">
      <div>
        <span className="mb-1.5 block text-sm font-medium text-text-secondary">Meses que paga</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Meses que paga">
          {MONTH_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={months === n}
              onClick={() => pickMonths(n)}
              className={[
                'h-9 min-w-11 rounded-lg border px-3 text-sm tabular-nums transition-colors duration-150',
                months === n
                  ? 'border-brand-blue bg-brand-blue/10 font-medium text-brand-blue'
                  : 'border-border text-text-secondary hover:text-text-primary',
              ].join(' ')}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-text-secondary">
          Queda pagado hasta el <span className="font-medium text-text-primary">{fmtDate(newPaidUntil)}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="pay-amount">Monto recibido</FieldLabel>
          <input
            id="pay-amount"
            inputMode="numeric"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setAmountEdited(true);
            }}
            className={`${inputClass} tabular-nums`}
          />
        </div>
        <div>
          <FieldLabel htmlFor="pay-date">Fecha del pago</FieldLabel>
          <input id="pay-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={inputClass} />
        </div>
        <div>
          <FieldLabel htmlFor="pay-method">Medio</FieldLabel>
          <select
            id="pay-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as SubscriptionPaymentMethod)}
            className={inputClass}
          >
            {SUBSCRIPTION_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{SUBSCRIPTION_PAYMENT_METHOD_LABELS[m]}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="pay-ref">Comprobante</FieldLabel>
          <input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N.º de SINPE o transferencia" className={inputClass} />
        </div>
      </div>
      <div>
        <FieldLabel htmlFor="pay-notes">Nota</FieldLabel>
        <input id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
      </div>

      {error && <p role="alert" className="text-sm text-brand-error">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={mutation.isPending} className={primaryButton}>
          {mutation.isPending && <Loader2 size={16} strokeWidth={1.5} className="animate-spin" aria-hidden />}
          Registrar {amount && /^\d/.test(amount) ? formatColones(Number(amount.replace(/\D/g, ''))) : 'pago'}
        </button>
        <button type="button" onClick={() => onDone(null)} className={secondaryButton}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function PaymentRow({ slug, payment: p, onVoided }: { slug: string; payment: SubscriptionPayment; onVoided: (msg: string) => void }) {
  const invalidate = useInvalidate(slug);
  const [confirming, setConfirming] = useState(false);
  const mutation = useMutation({
    mutationFn: () => platformApi.voidPayment(slug, p.id),
    onSuccess: ({ paidUntilReverted, tenant }) => {
      invalidate();
      onVoided(
        paidUntilReverted
          ? `Pago anulado. El vencimiento volvió al ${tenant.paidUntil ? fmtDate(tenant.paidUntil) : 'estado sin cobro'}.`
          : 'Pago anulado. El vencimiento no cambió: corrígelo en Datos si hace falta.',
      );
    },
  });
  const voided = p.voidedAt !== null;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium tabular-nums ${voided ? 'text-text-muted line-through' : 'text-text-primary'}`}>
          {formatColones(p.amount)}
          <span className="ml-2 font-normal text-text-secondary no-underline">
            {p.months} {p.months === 1 ? 'mes' : 'meses'} · {SUBSCRIPTION_PAYMENT_METHOD_LABELS[p.method]}
          </span>
        </p>
        <p className="text-xs text-text-muted">
          {fmtDate(p.paidAt)} · cubre hasta {fmtDate(p.periodTo)}
          {p.reference && ` · ${p.reference}`}
          {p.recordedBy && ` · @${p.recordedBy}`}
        </p>
        {p.notes && <p className="mt-0.5 text-xs text-text-secondary">{p.notes}</p>}
      </div>
      {voided ? (
        <span className="text-xs text-text-muted">Anulado</span>
      ) : confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">¿Anular?</span>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className={`${dangerButton} h-8 px-3`}>
            Anular
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={`${secondaryButton} h-8 px-3`}>
            No
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="h-8 rounded-lg px-2 text-xs text-text-muted transition-colors hover:text-brand-error">
          Anular
        </button>
      )}
    </li>
  );
}

// ─── Datos ────────────────────────────────────────────────────────────────────

function TenantForm({ tenant: t }: { tenant: PlatformTenant }) {
  const invalidate = useInvalidate(t.slug);
  const [name, setName] = useState(t.name);
  const [contactName, setContactName] = useState(t.contactName);
  const [contactPhone, setContactPhone] = useState(t.contactPhone);
  const [price, setPrice] = useState(t.monthlyPrice === null ? '' : String(t.monthlyPrice));
  const [billed, setBilled] = useState(t.paidUntil !== null);
  const [paidUntil, setPaidUntil] = useState(t.paidUntil ?? todayCR());
  const [notes, setNotes] = useState(t.notes);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof platformApi.updateTenant>[1]) => platformApi.updateTenant(t.slug, body),
    onSuccess: () => {
      invalidate();
      setMessage({ ok: true, text: 'Guardado.' });
    },
    onError: (err) => setMessage({ ok: false, text: errorText(err) }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const candidate = {
      name,
      contactName,
      contactPhone: contactPhone.replace(/\D/g, ''),
      monthlyPrice: price.trim() ? Number(price.replace(/\D/g, '')) : null,
      paidUntil: billed ? paidUntil : null,
      notes,
    };
    // Solo lo que cambió, para que la actividad muestre cambios reales.
    const changed = Object.fromEntries(
      Object.entries(candidate).filter(([k, v]) => t[k as keyof PlatformTenant] !== v),
    );
    if (Object.keys(changed).length === 0) {
      setMessage({ ok: true, text: 'No hay cambios.' });
      return;
    }
    const parsed = updateTenantSchema.safeParse(changed);
    if (!parsed.success) {
      setMessage({ ok: false, text: parsed.error.issues[0]?.message ?? 'Revisa los datos' });
      return;
    }
    mutation.mutate(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <FieldLabel htmlFor="td-name">Nombre</FieldLabel>
        <input id="td-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="td-contact">Contacto</FieldLabel>
          <input id="td-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <FieldLabel htmlFor="td-phone">Celular (WhatsApp)</FieldLabel>
          <input id="td-phone" inputMode="numeric" maxLength={9} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={`${inputClass} tabular-nums`} />
        </div>
        <div>
          <FieldLabel htmlFor="td-price">Precio especial</FieldLabel>
          <input id="td-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Vacío = precio por defecto" className={`${inputClass} tabular-nums`} />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="td-until" className="text-sm font-medium text-text-secondary">Pagado hasta</label>
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <input type="checkbox" checked={!billed} onChange={(e) => setBilled(!e.target.checked)} className="accent-[var(--color-brand-blue)]" />
              Sin cobro
            </label>
          </div>
          <input id="td-until" type="date" disabled={!billed} value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} className={`${inputClass} disabled:opacity-50`} />
        </div>
      </div>
      <div>
        <FieldLabel htmlFor="td-notes">Notas internas</FieldLabel>
        <textarea id="td-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaClass} />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={mutation.isPending} className={primaryButton}>
          {mutation.isPending && <Loader2 size={16} strokeWidth={1.5} className="animate-spin" aria-hidden />}
          Guardar
        </button>
        {message && (
          <p role="status" className={`text-sm ${message.ok ? 'text-text-secondary' : 'text-brand-error'}`}>{message.text}</p>
        )}
      </div>
    </form>
  );
}

// ─── Acceso ───────────────────────────────────────────────────────────────────

function Access({ tenant: t }: { tenant: PlatformTenant }) {
  const invalidate = useInvalidate(t.slug);
  const [code, setCode] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const codeMutation = useMutation({
    mutationFn: () => platformApi.setupCode(t.slug),
    onSuccess: ({ setupCode }) => setCode(setupCode),
  });
  const statusMutation = useMutation({
    mutationFn: (status: PlatformTenant['status']) => platformApi.setStatus(t.slug, status),
    onSuccess: () => {
      setConfirming(false);
      invalidate();
    },
  });
  const suspended = t.status === 'suspended';

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-text-primary">
          {t.activated ? 'El dueño ya creó su cuenta.' : 'El dueño todavía no ha creado su cuenta.'}
        </p>
        {!t.activated && (
          <div className="mt-3 space-y-3">
            {code ? (
              <SetupCodePanel tenant={t} code={code} />
            ) : (
              <button type="button" onClick={() => codeMutation.mutate()} disabled={codeMutation.isPending} className={secondaryButton}>
                <KeyRound size={16} strokeWidth={1.5} aria-hidden />
                Generar código nuevo
              </button>
            )}
            {codeMutation.error && <p className="text-sm text-brand-error">{errorText(codeMutation.error)}</p>}
            {!code && <p className="text-xs text-text-muted">El código anterior deja de servir.</p>}
          </div>
        )}
      </div>

      <div className="border-t border-border pt-6">
        <p className="text-sm text-text-primary">
          {suspended
            ? 'Suspendido: nadie del negocio puede entrar. Sus datos se conservan.'
            : 'Un atraso en el pago no bloquea al negocio. Suspender corta el acceso de todos sus usuarios al instante.'}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {suspended ? (
            <button type="button" onClick={() => statusMutation.mutate('active')} disabled={statusMutation.isPending} className={primaryButton}>
              Reactivar
            </button>
          ) : confirming ? (
            <>
              <button type="button" onClick={() => statusMutation.mutate('suspended')} disabled={statusMutation.isPending} className={dangerButton}>
                Sí, suspender {t.name}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={secondaryButton}>
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className={`${secondaryButton} text-brand-error`}>
              Suspender
            </button>
          )}
        </div>
        {statusMutation.error && <p className="mt-2 text-sm text-brand-error">{errorText(statusMutation.error)}</p>}
      </div>
    </div>
  );
}

// ─── Actividad ────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  TENANT_CREATED: 'Negocio creado',
  TENANT_UPDATED: 'Datos actualizados',
  TENANT_SUSPENDED: 'Suspendido',
  TENANT_ACTIVATED: 'Reactivado',
  TENANT_SETUP_CODE_ISSUED: 'Código de activación nuevo',
  PAYMENT_RECORDED: 'Pago registrado',
  PAYMENT_VOIDED: 'Pago anulado',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'nombre',
  contactName: 'contacto',
  contactPhone: 'celular',
  notes: 'notas',
  monthlyPrice: 'precio',
  paidUntil: 'pagado hasta',
};

function activityDetail(entry: PlatformAuditEntry): string | null {
  const p = entry.payload;
  if (!p) return null;
  if (entry.action === 'PAYMENT_RECORDED' || entry.action === 'PAYMENT_VOIDED') {
    return typeof p['amount'] === 'number' ? formatColones(p['amount']) : null;
  }
  if (entry.action === 'TENANT_UPDATED') {
    return Object.keys(p).map((k) => FIELD_LABELS[k] ?? k).join(', ');
  }
  return null;
}

function Activity({ entries }: { entries: PlatformAuditEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-text-muted">Sin actividad.</p>;
  return (
    <ol className="space-y-3">
      {entries.map((e) => {
        const detail = activityDetail(e);
        return (
          <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
            <span className="text-text-primary">
              {ACTION_LABELS[e.action] ?? e.action}
              {detail && <span className="text-text-secondary"> · {detail}</span>}
            </span>
            <span className="text-xs text-text-muted">
              {fmtDateTime(e.createdAt)}
              {e.superadmin && ` · @${e.superadmin}`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
