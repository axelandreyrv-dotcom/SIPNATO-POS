import { createRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Plus, Trash2, Printer } from 'lucide-react';
import { formatColones } from '@sipnato/shared';
import { createFactura } from '../../features/facturas/api';
import { useFacturaPrint } from '../../features/facturas/FacturaPrintView';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/nueva-factura',
  component: NuevaFacturaPage,
});

interface LineItem {
  quantity: number;
  description: string;
  unitPrice: string;
}

const emptyItem = (): LineItem => ({ quantity: 1, description: '', unitPrice: '' });
const today = () => new Date().toISOString().slice(0, 10);

function NuevaFacturaPage() {
  const navigate = useNavigate();
  const { printFactura, printPortal } = useFacturaPrint();
  const [date, setDate] = useState(today());
  const [clientName, setClientName] = useState('');
  const [clientCedula, setClientCedula] = useState('');
  const [ivaPercent, setIvaPercent] = useState(0);
  const [items, setItems] = useState<LineItem[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedConsecutive, setSavedConsecutive] = useState<number | null>(null);

  const updateItem = (i: number, field: keyof LineItem, value: string | number) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)));
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const subtotal = items.reduce((sum, it) => sum + it.quantity * (parseInt(it.unitPrice, 10) || 0), 0);
  const ivaAmount = Math.round((subtotal * ivaPercent) / 100);
  const total = subtotal + ivaAmount;

  const handleSave = async (andPrint: boolean) => {
    setError('');
    if (!clientName.trim()) { setError('El nombre del cliente es requerido.'); return; }
    if (items.some((it) => !it.description.trim())) { setError('Todos los ítems deben tener descripción.'); return; }

    setSaving(true);
    try {
      const factura = await createFactura({
        date,
        clientName: clientName.trim(),
        clientCedula: clientCedula.trim() || undefined,
        ivaPercent,
        items: items.map((it) => ({
          quantity: it.quantity,
          description: it.description.trim(),
          unitPrice: parseInt(it.unitPrice, 10) || 0,
        })),
      });

      if (andPrint) {
        // Stay mounted so the print effect can fire (navigating would unmount it).
        printFactura(factura);
        setSavedConsecutive(factura.consecutive);
        setClientName('');
        setClientCedula('');
        setIvaPercent(0);
        setItems([emptyItem()]);
      } else {
        void navigate({ to: '/facturas' as string });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando factura');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      {printPortal}

      <div className="flex items-center justify-between mb-6 print:hidden">
        <h1 className="text-xl font-semibold text-foreground">Nueva Factura</h1>
        <button
          onClick={() => void navigate({ to: '/facturas' as string })}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Volver
        </button>
      </div>

      {savedConsecutive !== null && (
        <div className="print:hidden mb-4 flex items-center justify-between rounded-lg border border-brand-success/30 bg-brand-success/10 px-4 py-3 text-sm">
          <span className="text-brand-success">
            Factura #{savedConsecutive} guardada e impresa. Formulario listo para la siguiente.
          </span>
          <button
            onClick={() => void navigate({ to: '/facturas' as string })}
            className="text-brand-blue hover:underline shrink-0 ml-3"
          >
            Ver facturas →
          </button>
        </div>
      )}

      <div className="print:hidden space-y-5">
        {/* Encabezado */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">FECHA</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">CLIENTE *</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nombre del cliente"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">CÉDULA</label>
            <input
              type="text"
              value={clientCedula}
              onChange={(e) => setClientCedula(e.target.value)}
              placeholder="0-0000-0000"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">IVA %</label>
            <input
              type="number"
              min={0}
              max={100}
              value={ivaPercent}
              onChange={(e) => setIvaPercent(parseInt(e.target.value, 10) || 0)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
        </div>

        {/* Ítems */}
        <div>
          <div className="grid grid-cols-[40px_1fr_90px_90px_36px] gap-2 text-xs font-medium text-muted-foreground mb-2 px-1">
            <span>CANT.</span><span>DESCRIPCIÓN</span>
            <span className="text-right">P. UNIT ₡</span>
            <span className="text-right">TOTAL ₡</span>
            <span />
          </div>
          <div className="space-y-2">
            {items.map((item, i) => {
              const lineTotal = item.quantity * (parseInt(item.unitPrice, 10) || 0);
              return (
                <div key={i} className="grid grid-cols-[40px_1fr_90px_90px_36px] gap-2 items-center">
                  <input
                    type="number" min={1} value={item.quantity}
                    onChange={(e) => updateItem(i, 'quantity', Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  />
                  <input
                    type="text" value={item.description}
                    onChange={(e) => updateItem(i, 'description', e.target.value)}
                    placeholder="Descripción"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  />
                  <input
                    type="number" min={0} value={item.unitPrice}
                    onChange={(e) => updateItem(i, 'unitPrice', e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  />
                  <div className="text-sm text-right text-foreground pr-1">{formatColones(lineTotal)}</div>
                  <button
                    onClick={() => removeItem(i)}
                    disabled={items.length === 1}
                    aria-label="Eliminar ítem"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 disabled:opacity-30"
                  >
                    <Trash2 size={15} strokeWidth={1.5} aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
          <button onClick={addItem} className="mt-3 flex items-center gap-1.5 text-sm text-brand-blue hover:text-brand-blue/80">
            <Plus size={15} strokeWidth={1.5} aria-hidden />
            Agregar línea
          </button>
        </div>

        {/* Totales */}
        <div className="flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal:</span><span>{formatColones(subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Impuestos ({ivaPercent}%):</span><span>{formatColones(ivaAmount)}</span>
            </div>
            <div className="flex justify-between font-semibold text-base border-t border-border pt-2 mt-2">
              <span>TOTAL:</span><span className="text-brand-blue">{formatColones(total)}</span>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* Acciones */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={() => void navigate({ to: '/facturas' as string })}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted/50"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleSave(false)}
            disabled={saving}
            className="rounded-lg bg-brand-success px-4 py-2 text-sm font-medium text-white hover:bg-brand-success/90 disabled:opacity-60"
          >
            Solo guardar
          </button>
          <button
            onClick={() => void handleSave(true)}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-blue/90 disabled:opacity-60"
          >
            <Printer size={15} strokeWidth={1.5} aria-hidden />
            Guardar e imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
