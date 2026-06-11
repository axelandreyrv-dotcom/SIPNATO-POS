import { BoletaNoEncontrada } from '../../lib/errors.js';
import type { BoletaList, BoletaWithCustomer, CreateBoletaInput } from '@sipnato/shared';
import { createBoletaRow, findBoletaById, listBoletasRows } from './repository.js';

interface Meta {
  ip: string | null;
  userAgent: string | null;
}

const PAGE_SIZE = 50;

export function createBoleta(input: CreateBoletaInput, meta: Meta): BoletaWithCustomer {
  return createBoletaRow(input, meta);
}

export function getBoleta(id: number): BoletaWithCustomer {
  const boleta = findBoletaById(id);
  if (!boleta) throw new BoletaNoEncontrada();
  return boleta;
}

export function listBoletas(q: string, page: number): BoletaList {
  return listBoletasRows(q.trim(), page, PAGE_SIZE);
}
