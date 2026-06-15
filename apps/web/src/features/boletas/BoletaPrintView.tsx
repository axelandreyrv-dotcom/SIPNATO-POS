import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BoletaWithCustomer, Settings } from '@sipnato/shared';
import { settingsApi } from '../settings/api';
import { fmtDateTime } from '../../lib/format';

function BoletaPrintView({
  boleta,
  settings,
}: {
  boleta: BoletaWithCustomer;
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

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.06em' }}>BOLETA DE INGRESO</div>
          <div style={{ fontSize: 13 }}>#{String(boleta.consecutive).padStart(4, '0')}</div>
          <div style={{ fontSize: 12 }}>{fmtDateTime(boleta.createdAt)}</div>
        </div>

        <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

        {/* Customer */}
        <div style={{ fontSize: 12, marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Cliente:</span>
            <span style={{ textAlign: 'right', wordBreak: 'break-word' }}>{boleta.customerName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600 }}>Tel:</span>
            <span>{boleta.customerPhone}</span>
          </div>
        </div>

        <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

        {/* Device */}
        <div style={{ fontSize: 12, marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Equipo:</span>
            <span style={{ textAlign: 'right', wordBreak: 'break-word' }}>{boleta.deviceModel}</span>
          </div>
          {boleta.imei && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
              <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>IMEI:</span>
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{boleta.imei}</span>
            </div>
          )}
          {boleta.unlockPassword && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
              <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Clave:</span>
              <span>{boleta.unlockPassword}</span>
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

        {/* Description */}
        <div style={{ fontSize: 12, marginBottom: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 3 }}>DESCRIPCIÓN:</div>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{boleta.description}</div>
        </div>

        <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

        {/* Signature */}
        <div style={{ fontSize: 11, marginBottom: 8 }}>
          <div style={{ marginBottom: 16 }}>Firma del cliente: _________________</div>
          <div>Fecha de entrega: _____ /_____ /_____</div>
        </div>

        <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: 12 }}>
          {footer
            ? <span style={{ whiteSpace: 'pre-wrap' }}>{footer}</span>
            : <span>Gracias por su preferencia</span>}
        </div>
      </div>
    </div>
  );
}

export function useBoletaPrint() {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
    staleTime: 5 * 60_000,
  });

  const [printData, setPrintData] = useState<BoletaWithCustomer | null>(null);

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

  const printBoleta = (boleta: BoletaWithCustomer) => setPrintData(boleta);

  const printPortal = printData
    ? createPortal(<BoletaPrintView boleta={printData} settings={settings} />, document.body)
    : null;

  return { printBoleta, printPortal };
}
