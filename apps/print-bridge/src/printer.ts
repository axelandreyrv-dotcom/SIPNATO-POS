import fs from 'node:fs';
import iconv from 'iconv-lite';
import type {
  SalePrintPayload,
  BoletaPrintPayload,
  QuotePrintPayload,
  TestPrintPayload,
  PrintPayload,
} from '@sipnato/shared';
import { bridgeConfig } from './config.js';

// ── ESC/POS constants ─────────────────────────────────────────────────────────
const ESC = 0x1b;
const GS = 0x1d;

const INIT = Buffer.from([ESC, 0x40]);
const ALIGN_LEFT = Buffer.from([ESC, 0x61, 0x00]);
const ALIGN_CENTER = Buffer.from([ESC, 0x61, 0x01]);
const ALIGN_RIGHT = Buffer.from([ESC, 0x61, 0x02]);
const BOLD_ON = Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF = Buffer.from([ESC, 0x45, 0x00]);
const SIZE_DOUBLE = Buffer.from([GS, 0x21, 0x11]);
const SIZE_NORMAL = Buffer.from([GS, 0x21, 0x00]);
// CP858 codepage — supports ñ, tildes, and ₡
const CODEPAGE_CP858 = Buffer.from([ESC, 0x74, 0x13]);
const LF = Buffer.from([0x0a]); // extra blank line (line() already appends LF)
const CUT = Buffer.from([GS, 0x56, 0x42, 0x00]);

const COLS = 48; // characters per line at normal size

// ── Helpers ───────────────────────────────────────────────────────────────────

function line(text = ''): Buffer {
  // iconv-lite encodes to CP858 so ñ, tildes, and ₡ map to the correct byte positions.
  return Buffer.concat([iconv.encode(text.slice(0, COLS), 'cp858'), Buffer.from([0x0a])]);
}

function padLine(left: string, right: string): Buffer {
  const pad = COLS - left.length - right.length;
  return line(left + ' '.repeat(Math.max(1, pad)) + right);
}

function divider(): Buffer {
  return line('-'.repeat(COLS));
}

function formatAmount(colones: number): string {
  // Avoid toLocaleString: it may insert narrow no-break spaces (U+202F) that don't
  // exist in CP858. Use plain ASCII thousands separator instead.
  const formatted = colones.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `₡${formatted}`; // U+20A1 = ₡, encoded to 0xD5 by iconv CP858
}

// ── Formatters ────────────────────────────────────────────────────────────────

function buildSaleTicket(p: SalePrintPayload): Buffer {
  const parts: Buffer[] = [
    INIT,
    CODEPAGE_CP858,
    ALIGN_CENTER,
    SIZE_DOUBLE,
    line(p.shopName || 'Dosuxsoft POS'),
    SIZE_NORMAL,
    BOLD_OFF,
    line(p.shopPhone),
    line(p.shopIdNumber),
    divider(),
    ALIGN_LEFT,
    BOLD_ON,
    line('RECIBO DE VENTA'),
    BOLD_OFF,
    padLine('No.', String(p.consecutive)),
    padLine('Fecha:', new Date(p.createdAt).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })),
    divider(),
    line(p.description ?? 'Servicio / Producto'),
    divider(),
    padLine('Metodo:', p.paymentMethod),
    BOLD_ON,
    padLine('TOTAL:', formatAmount(p.amount)),
    BOLD_OFF,
    divider(),
    ALIGN_CENTER,
    line(p.footer || 'Gracias por su compra'),
    LF,
    LF,
    LF,
    CUT,
  ];
  return Buffer.concat(parts);
}

function buildBoletaTicket(p: BoletaPrintPayload): Buffer {
  const parts: Buffer[] = [
    INIT,
    CODEPAGE_CP858,
    ALIGN_CENTER,
    SIZE_DOUBLE,
    line(p.shopName || 'Dosuxsoft POS'),
    SIZE_NORMAL,
    BOLD_OFF,
    line(p.shopPhone),
    line(p.shopIdNumber),
    divider(),
    ALIGN_LEFT,
    BOLD_ON,
    line('BOLETA DE SERVICIO'),
    BOLD_OFF,
    padLine('No.', String(p.consecutive)),
    padLine('Fecha:', new Date(p.createdAt).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })),
    divider(),
    padLine('Cliente:', p.customerName),
    padLine('Tel:', p.customerPhone),
    padLine('Equipo:', p.device),
  ];
  if (p.imei) parts.push(padLine('IMEI:', p.imei));
  parts.push(
    divider(),
    line('Descripcion:'),
    line(p.issueDescription),
  );
  if (p.estimatedCost !== null) {
    parts.push(padLine('Presupuesto:', formatAmount(p.estimatedCost)));
  }
  parts.push(
    divider(),
    ALIGN_CENTER,
    line(p.footer || 'Gracias por su confianza'),
    LF,
    LF,
    LF,
    CUT,
  );
  return Buffer.concat(parts);
}

function buildQuoteTicket(p: QuotePrintPayload): Buffer {
  const parts: Buffer[] = [
    INIT,
    CODEPAGE_CP858,
    ALIGN_CENTER,
    SIZE_DOUBLE,
    line(p.shopName || 'Dosuxsoft POS'),
    SIZE_NORMAL,
    BOLD_OFF,
    line(p.shopPhone),
    line(p.shopIdNumber),
    divider(),
    ALIGN_LEFT,
    BOLD_ON,
    line('COTIZACION'),
    BOLD_OFF,
    padLine('No.', String(p.consecutive)),
    padLine('Fecha:', new Date(p.createdAt).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })),
    divider(),
  ];
  for (const item of p.items) {
    parts.push(padLine(item.description.slice(0, 36), formatAmount(item.amount)));
  }
  parts.push(
    divider(),
    BOLD_ON,
    padLine('TOTAL:', formatAmount(p.total)),
    BOLD_OFF,
    divider(),
    ALIGN_CENTER,
    line(p.footer || 'Gracias por su preferencia'),
    LF,
    LF,
    LF,
    CUT,
  );
  return Buffer.concat(parts);
}

function buildTestTicket(p: TestPrintPayload): Buffer {
  return Buffer.concat([
    INIT,
    CODEPAGE_CP858,
    ALIGN_CENTER,
    BOLD_ON,
    line('*** PRUEBA DE IMPRESION ***'),
    BOLD_OFF,
    line(p.message),
    padLine('Hora:', new Date(p.timestamp).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })),
    line('Impresora OK'),
    LF,
    LF,
    LF,
    CUT,
  ]);
}

function buildTicket(payload: PrintPayload): Buffer {
  switch (payload.type) {
    case 'sale':    return buildSaleTicket(payload);
    case 'boleta':  return buildBoletaTicket(payload);
    case 'quote':   return buildQuoteTicket(payload);
    case 'test':    return buildTestTicket(payload);
  }
}

// ── Sink ──────────────────────────────────────────────────────────────────────

export function printJob(payload: PrintPayload): void {
  const data = buildTicket(payload);
  const path = bridgeConfig.printerPath;

  if (!path) {
    // No hardware — log the raw text for development.
    console.log('[printer] (stub) would print', data.length, 'bytes for job type:', payload.type);
    return;
  }

  // Write ESC/POS bytes directly to the device/file.
  const fd = fs.openSync(path, 'w');
  fs.writeSync(fd, data);
  fs.closeSync(fd);
}
