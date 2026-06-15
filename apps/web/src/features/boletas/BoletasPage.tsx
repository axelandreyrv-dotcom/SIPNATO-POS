import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Plus, Printer, Search } from 'lucide-react';
import type { BoletaWithCustomer } from '@sipnato/shared';
import { fmtDateTime } from '../../lib/format';
import { boletasApi } from './api';
import { useBoletaPrint } from './BoletaPrintView';

function BoletaRow({ boleta, onPrint }: { boleta: BoletaWithCustomer; onPrint: (b: BoletaWithCustomer) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-bg/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="w-8 shrink-0 text-right text-xs font-mono tabular-nums text-text-muted">
          #{boleta.consecutive}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{boleta.customerName}</p>
          <p className="text-xs text-text-muted">{boleta.customerPhone} · {boleta.deviceModel}</p>
        </div>
        {boleta.imei && (
          <span className="hidden shrink-0 text-xs tabular-nums text-text-muted sm:block">
            {boleta.imei}
          </span>
        )}
        <span className="shrink-0 text-xs text-text-muted">
          {fmtDateTime(boleta.createdAt)}
        </span>
        {expanded ? (
          <ChevronUp size={14} strokeWidth={1.5} className="shrink-0 text-text-muted" aria-hidden />
        ) : (
          <ChevronDown size={14} strokeWidth={1.5} className="shrink-0 text-text-muted" aria-hidden />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/60 bg-surface-bg px-4 py-4">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-text-muted">Modelo</dt>
              <dd className="text-sm text-text-primary">{boleta.deviceModel}</dd>
            </div>
            {boleta.imei && (
              <div>
                <dt className="text-xs text-text-muted">IMEI</dt>
                <dd className="font-mono text-sm text-text-primary">{boleta.imei}</dd>
              </div>
            )}
            {boleta.unlockPassword && (
              <div>
                <dt className="text-xs text-text-muted">Contraseña desbloqueo</dt>
                <dd className="text-sm text-text-primary">{boleta.unlockPassword}</dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="text-xs text-text-muted">Descripción</dt>
              <dd className="whitespace-pre-wrap text-sm text-text-primary">{boleta.description}</dd>
            </div>
          </dl>
          <div className="mt-4 border-t border-border/60 pt-3">
            <button
              type="button"
              onClick={() => onPrint(boleta)}
              className="flex items-center gap-1.5 text-sm text-brand-blue hover:text-brand-blue/80"
            >
              <Printer size={15} strokeWidth={1.5} aria-hidden />
              Imprimir boleta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function BoletasPage() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const { printBoleta, printPortal } = useBoletaPrint();

  const { data, isLoading } = useQuery({
    queryKey: ['boletas', 'list', search],
    queryFn: () => boletasApi.list(search, 1),
    staleTime: 15_000,
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(q.trim());
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      {printPortal}
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Boletas</h1>
          <p className="mt-1 text-sm text-text-muted">Registro de ingreso de equipos.</p>
        </div>
        <Link
          to="/nueva-boleta"
          className="flex h-9 items-center gap-1.5 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
        >
          <Plus size={15} strokeWidth={1.5} aria-hidden />
          Nueva
        </Link>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <Search size={15} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por cliente, celular, IMEI o número de boleta..."
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
        <div className="overflow-hidden rounded-xl border border-border bg-surface-card">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex animate-pulse items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <div className="h-3 w-6 rounded bg-border" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-3 w-2/3 rounded bg-border" />
                <div className="h-2.5 w-1/2 rounded bg-border" />
              </div>
              <div className="hidden h-2.5 w-20 rounded bg-border sm:block" />
              <div className="h-2.5 w-16 rounded bg-border" />
            </div>
          ))}
        </div>
      ) : !data?.boletas.length ? (
        <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border">
          <p className="text-sm text-text-muted">
            {search ? `Sin resultados para "${search}"` : 'Sin boletas registradas aún'}
          </p>
          {!search && (
            <Link to="/nueva-boleta" className="text-xs font-medium text-brand-blue hover:underline">
              Crear primera boleta →
            </Link>
          )}
        </div>
      ) : (
        <div>
          {data.total > 0 && (
            <p className="mb-2 text-xs text-text-muted">
              {data.total} {data.total === 1 ? 'boleta' : 'boletas'}
              {search && ` para "${search}"`}
            </p>
          )}
          <div className="overflow-hidden rounded-xl border border-border bg-surface-card">
            {data.boletas.map((b) => (
              <BoletaRow key={b.id} boleta={b} onPrint={printBoleta} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
