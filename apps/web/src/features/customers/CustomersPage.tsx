import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Loader2, Search } from 'lucide-react';
import type { BoletaSummary, Customer } from '@sipnato/shared';
import { customersApi } from './api';

const CR_TZ = 'America/Costa_Rica';

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: CR_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

function CustomerRow({ customer }: { customer: Customer }) {
  const [expanded, setExpanded] = useState(false);

  const { data, isFetching } = useQuery({
    queryKey: ['customer-detail', customer.id],
    queryFn: () => customersApi.get(customer.id),
    enabled: expanded,
    staleTime: 30_000,
  });

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-bg/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{customer.name}</p>
          <p className="text-xs text-text-muted">
            {customer.phone}
            {customer.idNumber && ` · ${customer.idNumber}`}
          </p>
        </div>
        {customer.email && (
          <span className="hidden shrink-0 truncate text-xs text-text-muted sm:block max-w-[180px]">
            {customer.email}
          </span>
        )}
        <span className="shrink-0 text-xs text-text-muted">{fmtDate(customer.createdAt)}</span>
        {expanded ? (
          <ChevronUp size={14} className="shrink-0 text-text-muted" />
        ) : (
          <ChevronDown size={14} className="shrink-0 text-text-muted" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/60 bg-surface-bg px-4 py-4">
          {isFetching ? (
            <div className="flex h-10 items-center justify-center">
              <Loader2 size={14} className="animate-spin text-text-muted" />
            </div>
          ) : (
            <BoletaHistory boletas={data?.boletas ?? []} />
          )}
        </div>
      )}
    </div>
  );
}

function BoletaHistory({ boletas }: { boletas: BoletaSummary[] }) {
  if (!boletas.length) {
    return <p className="text-xs text-text-muted italic">Sin boletas registradas.</p>;
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-text-muted">
        Historial de boletas ({boletas.length})
      </p>
      <div className="overflow-hidden rounded-lg border border-border bg-surface-card">
        {boletas.map((b) => (
          <div
            key={b.id}
            className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-0 text-xs"
          >
            <span className="w-7 shrink-0 text-right font-mono text-text-muted">#{b.consecutive}</span>
            <span className="flex-1 truncate text-text-primary">{b.deviceModel}</span>
            {b.imei && (
              <span className="hidden font-mono text-text-muted sm:block">{b.imei}</span>
            )}
            <span className="shrink-0 text-text-muted">
              {new Intl.DateTimeFormat('es-CR', {
                timeZone: 'America/Costa_Rica',
                day: '2-digit',
                month: 'short',
              }).format(new Date(b.createdAt))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CustomersPage() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['customers', 'list', search],
    queryFn: () => customersApi.list(search, 1),
    staleTime: 15_000,
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(q.trim());
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Clientes</h1>
        <p className="mt-1 text-sm text-text-muted">
          Directorio de clientes — clic para ver historial de boletas.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, celular o cédula..."
            className="h-10 w-full rounded-lg border border-border bg-surface-input pl-9 pr-4 text-sm text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20 placeholder:text-text-muted"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setQ(''); setSearch(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted hover:text-text-primary"
            >
              Limpiar
            </button>
          )}
        </div>
      </form>

      {/* Results */}
      {isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 size={18} strokeWidth={1.5} className="animate-spin text-text-muted" />
        </div>
      ) : !data?.customers.length ? (
        <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border">
          <p className="text-sm text-text-muted">
            {search ? `Sin resultados para "${search}"` : 'Sin clientes registrados aún'}
          </p>
        </div>
      ) : (
        <div>
          {data.total > 0 && (
            <p className="mb-2 text-xs text-text-muted">
              {data.total} {data.total === 1 ? 'cliente' : 'clientes'}
              {search && ` para "${search}"`}
            </p>
          )}
          <div className="overflow-hidden rounded-xl border border-border bg-surface-card">
            {data.customers.map((c) => (
              <CustomerRow key={c.id} customer={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
