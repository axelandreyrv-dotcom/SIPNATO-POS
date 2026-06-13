import type { CreateFacturaInput } from '@sipnato/shared';
import { FacturaNoEncontrada, FacturaYaAnulada } from '../../lib/errors.js';
import { anularFacturaRow, getFacturaRow, insertFacturaRow, listFacturasRows } from './repository.js';

type Meta = { ip: string; userAgent?: string };

export function listFacturas(page: number, search?: string) {
  return listFacturasRows(page, search);
}

export function getFactura(id: number) {
  const factura = getFacturaRow(id);
  if (!factura) throw new FacturaNoEncontrada();
  return factura;
}

export function createFactura(input: CreateFacturaInput, meta: Meta) {
  return insertFacturaRow(input, meta);
}

export function anularFactura(id: number, meta: Meta) {
  try {
    return anularFacturaRow(id, meta);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND') throw new FacturaNoEncontrada();
      if (err.message === 'YA_ANULADA') throw new FacturaYaAnulada();
    }
    throw err;
  }
}
