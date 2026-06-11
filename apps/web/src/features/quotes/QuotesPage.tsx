import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2, Plus, Trash2, X } from 'lucide-react';
import { formatColones } from '@sipnato/shared';
import type { Quote } from '@sipnato/shared';
import { quotesApi } from './api';

const CR_TZ = 'America/Costa_Rica';

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: CR_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

// ── Quote items detail (fetched on expand) ────────────────────────────────────
function QuoteDetail({ id }: { id: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['quotes', id],
    queryFn: () => quotesApi.getById(id),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 size={14} className="animate-spin text-text-muted" />
      </div>
    );
  }

  if (!data?.items.length) {
    return <p className="py-2 text-xs text-text-muted">Sin ítems</p>;
  }

  return (
    <table className="w-full text-xs">
      <tbody className="divide-y divide-border/50">
        {data.items.map((item) => (
          <tr key={item.id}>
            <td className="py-1.5 pr-4 text-text-secondary">{item.description}</td>
            <td className="py-1.5 text-right tabular-nums font-medium text-text-primary whitespace-nowrap">
              {formatColones(item.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Quote row ─────────────────────────────────────────────────────────────────
function QuoteRow({
  quote,
  expanded,
  onToggle,
  onDelete,
  isDeleting,
}: {
  quote: Quote;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0 hover:bg-surface-bg/40 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
          aria-expanded={expanded}
          aria-label={expanded ? 'Colapsar ítems' : 'Ver ítems'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <span className="w-12 shrink-0 text-xs tabular-nums font-medium text-brand-blue">
          #{String(quote.consecutive).padStart(3, '0')}
        </span>

        <span className="min-w-0 flex-1 truncate text-xs text-text-muted">
          {fmtDate(quote.createdAt)}
        </span>

        <span className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">
          {formatColones(quote.total)}
        </span>

        {confirming ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => { onDelete(); setConfirming(false); }}
              disabled={isDeleting}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-brand-error bg-brand-error/10 hover:bg-brand-error/20 transition-colors disabled:opacity-50"
            >
              {isDeleting && <Loader2 size={11} className="animate-spin" />}
              Eliminar
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded p-1 text-text-muted hover:text-text-primary"
              aria-label="Cancelar"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="shrink-0 rounded p-1.5 text-text-muted transition-colors hover:bg-brand-error/10 hover:text-brand-error"
            aria-label="Eliminar cotización"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-b border-border/60 bg-surface-bg/30 px-10 py-3 last:border-0">
          <QuoteDetail id={quote.id} />
        </div>
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function QuotesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['quotes', 'list', page],
    queryFn: () => quotesApi.list(page),
    staleTime: 10_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => quotesApi.delete(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['quotes', 'list'] });
      queryClient.removeQueries({ queryKey: ['quotes', id] });
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
  });

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Cotizaciones</h1>
          <p className="mt-1 text-sm text-text-muted">Presupuestos generados para clientes.</p>
        </div>
        <Link
          to="/nueva-cotizacion"
          className="flex items-center gap-2 rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99]"
        >
          <Plus size={15} />
          <span className="hidden sm:inline">Nueva cotización</span>
          <span className="sm:hidden">Nueva</span>
        </Link>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 size={18} strokeWidth={1.5} className="animate-spin text-text-muted" />
        </div>
      ) : !data?.quotes.length ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border">
          <p className="text-sm text-text-muted">No hay cotizaciones todavía.</p>
          <Link
            to="/nueva-cotizacion"
            className="text-xs font-medium text-brand-blue hover:underline"
          >
            Crear la primera →
          </Link>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-surface-card">
            {data.quotes.map((quote) => (
              <QuoteRow
                key={quote.id}
                quote={quote}
                expanded={expanded.has(quote.id)}
                onToggle={() => toggleExpand(quote.id)}
                onDelete={() => deleteMutation.mutate(quote.id)}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === quote.id}
              />
            ))}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-bg disabled:opacity-40"
              >
                ← Anterior
              </button>
              <span className="text-xs text-text-muted">
                Página {page} de {data.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-bg disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
