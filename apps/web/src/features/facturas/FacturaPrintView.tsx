import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatColones } from '@sipnato/shared';
import type { FacturaWithItems, Settings } from '@sipnato/shared';
import { settingsApi } from '../settings/api';

// ── Print overlay — 80mm thermal, reuses .sale-print-overlay infrastructure ────
function FacturaPrintView({
  factura,
  settings,
}: {
  factura: FacturaWithItems;
  settings: Settings | undefined;
}) {
  const shopName = settings?.shop_name?.trim() || 'Dosuxsoft';
  const shopPhone = settings?.shop_phone?.trim();
  const shopId = settings?.shop_id_number?.trim();
  const footer = settings?.receipt_footer?.trim();

  return (
    <div className="sale-print-overlay" style={{ fontFamily: '"Courier New", Courier, monospace', color: '#000' }}>
      <div style={{ width: '100%', maxWidth: 280, margin: '0 auto', padding: '4px 0', fontSize: 13, lineHeight: 1.5 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{shopName}</div>
          {shopId && <div style={{ fontSize: 12 }}>Cédula: {shopId}</div>}
          {shopPhone && <div style={{ fontSize: 12 }}>Tel: {shopPhone}</div>}
        </div>

        <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

        {/* Title & meta */}
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.08em' }}>FACTURA</div>
          <div style={{ fontSize: 13 }}>#{String(factura.consecutive).padStart(4, '0')}</div>
          <div style={{ fontSize: 13 }}>{factura.date}</div>
        </div>

        <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

        {/* Client */}
        <div style={{ fontSize: 12, marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Cliente:</span>
            <span style={{ textAlign: 'right', wordBreak: 'break-word' }}>{factura.clientName}</span>
          </div>
          {factura.clientCedula && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>Cédula:</span><span>{factura.clientCedula}</span>
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

        {/* Items */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
          <span>CANT · DESCRIPCIÓN</span><span>TOTAL</span>
        </div>
        {factura.items.map((item) => (
          <div key={item.id} style={{ fontSize: 12, marginBottom: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
              <span style={{ flex: 1, wordBreak: 'break-word', paddingRight: 4 }}>
                {item.quantity}x {item.description}
              </span>
              <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{formatColones(item.total)}</span>
            </div>
            {item.quantity > 1 && (
              <div style={{ textAlign: 'right', fontSize: 11, opacity: 0.7 }}>
                {formatColones(item.unitPrice)} c/u
              </div>
            )}
          </div>
        ))}

        <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

        {/* Totals */}
        <div style={{ fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span>Subtotal:</span><span>{formatColones(factura.subtotal)}</span>
          </div>
          {factura.ivaPercent > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span>IVA ({factura.ivaPercent}%):</span><span>{formatColones(factura.ivaAmount)}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4, borderTop: '2px solid #000', paddingTop: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>TOTAL</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{formatColones(factura.total)}</span>
        </div>

        {factura.status === 'anulada' && (
          <>
            <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
            <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700 }}>*** ANULADA ***</div>
          </>
        )}

        <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: 12 }}>
          {footer
            ? <span style={{ whiteSpace: 'pre-wrap' }}>{footer}</span>
            : <span>Gracias por su compra</span>}
        </div>
      </div>
    </div>
  );
}

// ── Hook: encapsulates the print portal + body-class + @page injection ─────────
export function useFacturaPrint() {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
    staleTime: 5 * 60_000,
  });

  const [printData, setPrintData] = useState<FacturaWithItems | null>(null);

  useEffect(() => {
    if (!printData) return;
    const timer = setTimeout(() => {
      const pageStyle = document.createElement('style');
      pageStyle.textContent = '@media print { @page { size: 80mm auto; margin: 2mm 3mm; } }';
      document.head.appendChild(pageStyle);
      document.body.classList.add('print-sale');

      window.print();

      document.body.classList.remove('print-sale');
      pageStyle.remove();
      setPrintData(null);
    }, 150);
    return () => clearTimeout(timer);
  }, [printData]);

  const printFactura = (factura: FacturaWithItems) => setPrintData(factura);

  const printPortal = printData
    ? createPortal(<FacturaPrintView factura={printData} settings={settings} />, document.body)
    : null;

  return { printFactura, printPortal };
}
