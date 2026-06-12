import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { formatColones } from '@sipnato/shared';
import type { Quote, QuoteWithItems, Settings } from '@sipnato/shared';
import { fmtDate } from '../../lib/format';
import { settingsApi } from '../settings/api';
import { quotesApi } from './api';

// ── Print view (portal, only visible on print) ───────────────────────────────
function QuotePrintView({ quote, settings }: { quote: QuoteWithItems; settings: Settings | undefined }) {
  const date = new Date(quote.createdAt).toLocaleDateString('es-CR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Costa_Rica',
  });

  const shopName = settings?.shop_name?.trim() || 'Dosuxsoft';
  const shopPhone = settings?.shop_phone?.trim();
  const shopId = settings?.shop_id_number?.trim();
  const quoteFooter = settings?.quote_footer?.trim();

  return (
    <div
      className="quote-print-overlay"
      style={{ fontFamily: 'system-ui, -apple-system, sans-serif', color: '#0f172a' }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {/* Header — business info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{shopName}</div>
            {shopId && (
              <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>Cédula: {shopId}</div>
            )}
            {shopPhone && (
              <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>Tel: {shopPhone}</div>
            )}
          </div>
          <div style={{ textAlign: 'right', fontSize: 13, color: '#475569', paddingTop: 4 }}>
            {date}
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '2px solid #0f172a', margin: '0 0 24px' }} />

        {/* Quote number */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.01em' }}>
            COTIZACIÓN #{String(quote.consecutive).padStart(3, '0')}
          </div>
        </div>

        {/* Items table */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', borderBottom: '1px solid #cbd5e1', fontWeight: 600 }}>
                Descripción
              </th>
              <th style={{ textAlign: 'right', padding: '6px 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', borderBottom: '1px solid #cbd5e1', fontWeight: 600 }}>
                Monto
              </th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item, i) => (
              <tr key={i}>
                <td style={{ padding: '9px 0', fontSize: 14, borderBottom: '1px solid #f1f5f9', color: '#0f172a' }}>
                  {item.description}
                </td>
                <td style={{ padding: '9px 0', fontSize: 14, borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#0f172a' }}>
                  {formatColones(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ padding: '14px 0 0', fontWeight: 700, fontSize: 15, borderTop: '2px solid #0f172a' }}>
                TOTAL
              </td>
              <td style={{ padding: '14px 0 0', fontWeight: 700, fontSize: 20, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderTop: '2px solid #0f172a' }}>
                {formatColones(quote.total)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Footer */}
        <div style={{ marginTop: 48, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
          {quoteFooter ? (
            <div style={{ fontSize: 12, color: '#475569', whiteSpace: 'pre-wrap' }}>{quoteFooter}</div>
          ) : (
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              Este documento es una cotización y no constituye factura oficial.
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
        <Loader2 size={14} strokeWidth={1.5} className="animate-spin text-text-muted" aria-hidden />
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
  onEdit,
  onPDF,
  isDeleting,
  isPDFLoading,
}: {
  quote: Quote;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onPDF: () => void;
  isDeleting: boolean;
  isPDFLoading: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 last:border-0 hover:bg-surface-bg/40 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
          aria-expanded={expanded}
          aria-label={expanded ? 'Colapsar ítems' : 'Ver ítems'}
        >
          {expanded ? <ChevronDown size={14} strokeWidth={1.5} aria-hidden /> : <ChevronRight size={14} strokeWidth={1.5} aria-hidden />}
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
              {isDeleting && <Loader2 size={11} strokeWidth={1.5} className="animate-spin" aria-hidden />}
              Eliminar
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex h-8 w-8 items-center justify-center rounded text-text-muted hover:text-text-primary"
              aria-label="Cancelar"
            >
              <X size={13} strokeWidth={1.5} aria-hidden />
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={onEdit}
              className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-colors hover:bg-brand-blue/10 hover:text-brand-blue"
              aria-label="Editar cotización"
            >
              <Pencil size={13} strokeWidth={1.5} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onPDF}
              disabled={isPDFLoading}
              className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-bg hover:text-text-primary disabled:opacity-40"
              aria-label="Descargar PDF"
            >
              {isPDFLoading
                ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" aria-hidden />
                : <Download size={13} strokeWidth={1.5} aria-hidden />
              }
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-colors hover:bg-brand-error/10 hover:text-brand-error"
              aria-label="Eliminar cotización"
            >
              <Trash2 size={13} strokeWidth={1.5} aria-hidden />
            </button>
          </div>
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [printData, setPrintData] = useState<QuoteWithItems | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
    staleTime: 300_000,
  });

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

  // Trigger print after portal renders
  useEffect(() => {
    if (!printData) return;
    const timer = setTimeout(() => {
      window.print();
      setPrintData(null);
    }, 150);
    return () => clearTimeout(timer);
  }, [printData]);

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handlePDF(quote: Quote) {
    setPdfLoadingId(quote.id);
    try {
      let data = queryClient.getQueryData<QuoteWithItems>(['quotes', quote.id]);
      if (!data) {
        data = await quotesApi.getById(quote.id);
        queryClient.setQueryData(['quotes', quote.id], data);
      }
      setPrintData(data);
    } finally {
      setPdfLoadingId(null);
    }
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
          <Plus size={15} strokeWidth={1.5} aria-hidden />
          <span className="hidden sm:inline">Nueva cotización</span>
          <span className="sm:hidden">Nueva</span>
        </Link>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-card">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex animate-pulse items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <div className="h-3 w-3 rounded bg-border/50" />
              <div className="h-3 w-10 rounded bg-border" />
              <div className="h-2.5 flex-1 rounded bg-border" />
              <div className="h-3 w-16 rounded bg-border" />
              <div className="h-7 w-24 rounded bg-border/40" />
            </div>
          ))}
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
                onEdit={() => void navigate({ to: '/editar-cotizacion', search: { id: quote.id } })}
                onPDF={() => void handlePDF(quote)}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === quote.id}
                isPDFLoading={pdfLoadingId === quote.id}
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

      {/* Print portal — only visible during window.print() */}
      {printData && createPortal(
        <QuotePrintView quote={printData} settings={settings} />,
        document.body,
      )}
    </div>
  );
}
