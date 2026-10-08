import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, Search } from 'lucide-react';
import { formatColones, type PlatformSummary, type PlatformTenant } from '@sipnato/shared';
import { platformApi } from './api';
import { Link } from './router';
import {
  dueText,
  errorText,
  primaryButton,
  SubscriptionBadge,
  SuspendedBadge,
  tenantHost,
} from './ui';

const FILTERS = [
  { key: 'todos', label: 'Todos', test: () => true },
  {
    key: 'cobrar',
    label: 'Por cobrar',
    test: (t: PlatformTenant) => t.subscription === 'vencido' || t.subscription === 'por_vencer',
  },
  { key: 'sin-activar', label: 'Sin activar', test: (t: PlatformTenant) => !t.activated },
  {
    key: 'suspendidos',
    label: 'Suspendidos',
    test: (t: PlatformTenant) => t.status === 'suspended',
  },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

// Primero lo que hay que cobrar: vencidos (el más atrasado arriba), luego por vencer.
const URGENCY = { vencido: 0, por_vencer: 1, al_dia: 2, sin_cobro: 3 } as const;

function byUrgency(a: PlatformTenant, b: PlatformTenant): number {
  return (
    URGENCY[a.subscription] - URGENCY[b.subscription] ||
    (a.daysLeft ?? 0) - (b.daysLeft ?? 0) ||
    a.name.localeCompare(b.name)
  );
}

export function TenantsPage() {
  const [filter, setFilter] = useState<FilterKey>('todos');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim().toLowerCase());
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['platform-tenants'],
    queryFn: platformApi.tenants,
  });

  const test = FILTERS.find((f) => f.key === filter)!.test;
  const tenants = (data?.tenants ?? [])
    .filter(test)
    .filter(
      (t) =>
        !q ||
        [t.name, t.slug, t.contactName, t.contactPhone].some((v) => v.toLowerCase().includes(q)),
    )
    .sort(byUrgency);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Negocios</h1>
        <Link to="/nuevo" className={primaryButton}>
          <Plus size={16} strokeWidth={1.5} aria-hidden />
          Nuevo negocio
        </Link>
      </div>

      {data ? (
        <SummaryStrip summary={data.summary} />
      ) : (
        <div className="h-[72px] animate-pulse rounded-xl bg-border/50" />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
          role="tablist"
          aria-label="Filtrar negocios"
        >
          {FILTERS.map((f) => {
            const n = data?.tenants.filter(f.test).length;
            return (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={[
                  'flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors duration-150',
                  filter === f.key
                    ? 'bg-brand-blue/10 font-medium text-brand-blue'
                    : 'text-text-secondary hover:bg-border/50 hover:text-text-primary',
                ].join(' ')}
              >
                {f.label}
                {n !== undefined && <span className="tabular-nums text-xs opacity-70">{n}</span>}
              </button>
            );
          })}
        </div>
        <label className="relative block sm:w-64">
          <span className="sr-only">Buscar negocio</span>
          <Search
            size={16}
            strokeWidth={1.5}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre, subdominio o contacto"
            className="h-9 w-full rounded-lg border border-border bg-surface-input pl-9 pr-3 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20"
          />
        </label>
      </div>

      {error ? (
        <div className="rounded-xl border border-border bg-surface-card p-6 text-sm">
          <p className="text-brand-error">{errorText(error)}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 font-medium text-brand-blue hover:underline"
          >
            Reintentar
          </button>
        </div>
      ) : isPending ? (
        <div className="space-y-px overflow-hidden rounded-xl border border-border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[68px] animate-pulse bg-surface-card" />
          ))}
        </div>
      ) : tenants.length === 0 ? (
        <EmptyState hasAny={(data?.tenants.length ?? 0) > 0} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-card">
          {tenants.map((t) => (
            <TenantRow key={t.slug} tenant={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryStrip({ summary }: { summary: PlatformSummary }) {
  const cells: { label: string; value: string; tone?: string | undefined }[] = [
    { label: 'Activos', value: String(summary.active) },
    {
      label: 'Vencidos',
      value: String(summary.overdue),
      tone: summary.overdue > 0 ? 'text-brand-error' : undefined,
    },
    {
      label: 'Por vencer',
      value: String(summary.dueSoon),
      tone: summary.dueSoon > 0 ? 'text-brand-warning' : undefined,
    },
    { label: 'Mensualidades', value: formatColones(summary.monthlyRevenue) },
    { label: 'Cobrado este mes', value: formatColones(summary.collectedThisMonth) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-5">
      {cells.map((c, i) => (
        <div
          key={c.label}
          className={`bg-surface-card px-4 py-3 ${i === cells.length - 1 ? 'col-span-2 sm:col-span-1' : ''}`}
        >
          <dt className="text-xs text-text-muted">{c.label}</dt>
          <dd
            className={`mt-0.5 text-lg font-semibold tabular-nums ${c.tone ?? 'text-text-primary'}`}
          >
            {c.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TenantRow({ tenant: t }: { tenant: PlatformTenant }) {
  const urgent = t.subscription === 'vencido';
  return (
    <li>
      <Link
        to={`/negocios/${t.slug}`}
        className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors duration-150 hover:bg-brand-blue/[0.04] sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto]"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">{t.name}</p>
          <p className="truncate text-xs text-text-muted">{tenantHost(t.slug)}</p>
        </div>

        <div className="col-start-1 row-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto sm:row-start-auto">
          {t.status === 'suspended' ? (
            <SuspendedBadge />
          ) : (
            <SubscriptionBadge status={t.subscription} />
          )}
          {!t.activated && (
            <span className="inline-flex h-6 items-center rounded-md border border-dashed border-border px-2 text-xs text-text-secondary">
              Sin activar
            </span>
          )}
          <span
            className={`text-xs ${urgent ? 'font-medium text-brand-error' : 'text-text-secondary'}`}
          >
            {dueText(t)}
          </span>
        </div>

        <div className="hidden min-w-0 text-sm sm:block">
          <p className="tabular-nums text-text-primary">
            {t.subscription === 'sin_cobro' ? '—' : formatColones(t.effectivePrice)}
            {t.monthlyPrice !== null && t.subscription !== 'sin_cobro' && (
              <span className="ml-1.5 text-xs text-text-muted">especial</span>
            )}
          </p>
          <p className="truncate text-xs text-text-muted">{t.contactName || 'Sin contacto'}</p>
        </div>

        <ChevronRight
          size={16}
          strokeWidth={1.5}
          className="row-span-2 text-text-muted sm:row-span-1"
          aria-hidden
        />
      </Link>
    </li>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  if (hasAny) {
    return (
      <p className="rounded-xl border border-border bg-surface-card px-4 py-10 text-center text-sm text-text-muted">
        Ningún negocio coincide.
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm font-medium text-text-primary">Todavía no hay negocios</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
        Al crear uno se genera su base de datos y un código de activación para que el dueño
        configure su cuenta.
      </p>
      <Link to="/nuevo" className={`${primaryButton} mt-5`}>
        <Plus size={16} strokeWidth={1.5} aria-hidden />
        Crear el primero
      </Link>
    </div>
  );
}
