import { createRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Printer, XCircle, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { formatColones } from '@sipnato/shared';
import { fetchFactura, fetchFacturas, anularFactura } from '../../features/facturas/api';
import { useFacturaPrint } from '../../features/facturas/FacturaPrintView';
import { Route as authRoute } from '../_auth';
import type { Factura, FacturaWithItems } from '@sipnato/shared';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/facturas',
  component: FacturasPage,
});

function FacturaRow({ factura, onReprint, onAnular }: {
  factura: Factura;
  onReprint: (id: number) => void;
  onAnular: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmAnular, setConfirmAnular] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['factura', factura.id],
    queryFn: () => fetchFactura(factura.id),
    enabled: expanded,
    staleTime: Infinity,
  });

  const isAnulada = factura.status === 'anulada';

  return (
    <div className={`border border-border rounded-xl overflow-hidden ${isAnulada ? 'opacity-60' : ''}`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">#{factura.consecutive}</span>
            {isAnulada && (
              <span className="rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 text-xs font-medium">
                Anulada
              </span>
            )}
            <span className="text-muted-foreground text-xs">{factura.date}</span>
          </div>
          <p className="text-sm text-muted-foreground truncate mt-0.5">{factura.clientName}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-semibold text-sm">{formatColones(factura.total)}</div>
          {factura.ivaPercent > 0 && (
            <div className="text-xs text-muted-foreground">IVA {factura.ivaPercent}%</div>
          )}
        </div>
        {expanded
          ? <ChevronUp size={16} strokeWidth={1.5} className="text-muted-foreground shrink-0" aria-hidden />
          : <ChevronDown size={16} strokeWidth={1.5} className="text-muted-foreground shrink-0" aria-hidden />
        }
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3 bg-muted/10">
          {detailQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}
          {detailQuery.data && (
            <>
              {factura.clientCedula && (
                <p className="text-xs text-muted-foreground mb-2">Cédula: {factura.clientCedula}</p>
              )}
              <table className="w-full text-sm mb-3">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left py-1">Cant.</th>
                    <th className="text-left py-1">Descripción</th>
                    <th className="text-right py-1">P. Unit</th>
                    <th className="text-right py-1">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {detailQuery.data.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-1 pr-3">{item.quantity}</td>
                      <td className="py-1 pr-3">{item.description}</td>
                      <td className="py-1 pr-3 text-right">{formatColones(item.unitPrice)}</td>
                      <td className="py-1 text-right">{formatColones(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end">
                <div className="w-48 space-y-0.5 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal:</span><span>{formatColones(factura.subtotal)}</span>
                  </div>
                  {factura.ivaPercent > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>IVA ({factura.ivaPercent}%):</span><span>{formatColones(factura.ivaAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t border-border pt-1">
                    <span>Total:</span><span>{formatColones(factura.total)}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
            <button
              onClick={() => onReprint(factura.id)}
              className="flex items-center gap-1.5 text-sm text-brand-blue hover:text-brand-blue/80"
            >
              <Printer size={15} strokeWidth={1.5} aria-hidden />
              Reimprimir
            </button>

            {!isAnulada && !confirmAnular && (
              <button
                onClick={() => setConfirmAnular(true)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-red-500 ml-auto"
              >
                <XCircle size={15} strokeWidth={1.5} aria-hidden />
                Anular
              </button>
            )}
            {!isAnulada && confirmAnular && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-muted-foreground">¿Confirmar anulación?</span>
                <button
                  onClick={() => { onAnular(factura.id); setConfirmAnular(false); }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
                  aria-label="Confirmar anulación"
                >
                  <XCircle size={15} strokeWidth={1.5} aria-hidden />
                </button>
                <button
                  onClick={() => setConfirmAnular(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted/50"
                  aria-label="Cancelar"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FacturasPage() {
  const navigate = useNavigate();
  const { printFactura, printPortal } = useFacturaPrint();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['facturas', page, debouncedSearch],
    queryFn: () => fetchFacturas(page, debouncedSearch || undefined),
  });

  const anularMutation = useMutation({
    mutationFn: anularFactura,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['facturas'] });
      void queryClient.invalidateQueries({ queryKey: ['factura'] });
    },
  });

  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(1);
    clearTimeout((window as Window & { _fs?: ReturnType<typeof setTimeout> })._fs);
    (window as Window & { _fs?: ReturnType<typeof setTimeout> })._fs = setTimeout(
      () => setDebouncedSearch(v),
      300,
    );
  };

  const handleReprint = async (id: number) => {
    const cached = queryClient.getQueryData<FacturaWithItems>(['factura', id]);
    const factura = cached ?? (await fetchFactura(id));
    printFactura(factura);
  };

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      {printPortal}

      <div className="print:hidden">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Facturas</h1>
            {data && <p className="text-sm text-muted-foreground mt-0.5">{data.total} factura{data.total !== 1 ? 's' : ''}</p>}
          </div>
          <button
            onClick={() => void navigate({ to: '/nueva-factura' as string })}
            className="flex items-center gap-2 rounded-xl bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-blue/90"
          >
            <Plus size={16} strokeWidth={1.5} aria-hidden />
            Nueva
          </button>
        </div>

        <div className="relative mb-4">
          <Search size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar por cliente, cédula o número..."
            className="w-full rounded-xl border border-border bg-background pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
          />
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && data?.data.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg mb-1">No hay facturas</p>
            <p className="text-sm">Creá la primera con el botón "Nueva".</p>
          </div>
        )}

        {!isLoading && data && data.data.length > 0 && (
          <div className="space-y-3">
            {data.data.map((f) => (
              <FacturaRow
                key={f.id}
                factura={f}
                onReprint={(id) => void handleReprint(id)}
                onAnular={(id) => anularMutation.mutate(id)}
              />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted/50"
            >
              ← Anterior
            </button>
            <span className="px-3 py-1.5 text-sm text-muted-foreground">{page} / {totalPages}</span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted/50"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
