import { ApartadoNoEncontrado, ApartadoNoActivo } from '../../lib/errors.js';
import {
  insertApartadoRow,
  listApartadosRows,
  getApartadoWithPaymentsRow,
  addPaymentRow,
  cancelApartadoRow,
} from './repository.js';
import type { CreateApartadoInput, AddApartadoPaymentInput } from '@sipnato/shared';

export function createApartado(
  data: CreateApartadoInput,
  meta: { ip?: string; userAgent?: string },
) {
  return insertApartadoRow(data, meta);
}

export function listApartados(filter?: { status?: string; search?: string }) {
  return listApartadosRows(filter);
}

export function getApartado(id: number) {
  const apartado = getApartadoWithPaymentsRow(id);
  if (!apartado) throw new ApartadoNoEncontrado();
  return apartado;
}

export function addPayment(
  id: number,
  data: AddApartadoPaymentInput,
  meta: { ip?: string; userAgent?: string },
) {
  const apartado = getApartadoWithPaymentsRow(id);
  if (!apartado) throw new ApartadoNoEncontrado();
  if (apartado.status !== 'activo') throw new ApartadoNoActivo();
  return addPaymentRow(id, data, meta);
}

export function cancelApartado(
  id: number,
  meta: { ip?: string; userAgent?: string },
) {
  const apartado = getApartadoWithPaymentsRow(id);
  if (!apartado) throw new ApartadoNoEncontrado();
  if (apartado.status !== 'activo') throw new ApartadoNoActivo();
  return cancelApartadoRow(id, meta);
}
