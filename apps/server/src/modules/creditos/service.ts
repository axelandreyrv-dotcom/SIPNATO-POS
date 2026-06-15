import type { CreateCredito, AddCreditoPayment, Credito, CreditoWithPayments } from '@sipnato/shared';
import { CreditoNoEncontrado, CreditoNoActivo, AbonoPagoExcede } from '../../lib/errors.js';
import {
  insertCreditoRow,
  listCreditoRows,
  getCreditoWithPaymentsRow,
  addCreditoPaymentRow,
  cancelCreditoRow,
} from './repository.js';

type Meta = { ip?: string; userAgent?: string };

export function createCredito(data: CreateCredito, meta: Meta): Credito {
  return insertCreditoRow(data, meta);
}

export function listCreditos(status?: string, search?: string): Credito[] {
  return listCreditoRows(status, search);
}

export function getCredito(id: number): CreditoWithPayments {
  const credito = getCreditoWithPaymentsRow(id);
  if (!credito) throw new CreditoNoEncontrado();
  return credito;
}

export function addPayment(
  id: number,
  data: AddCreditoPayment,
  meta: Meta,
): { credito: Credito; payment: ReturnType<typeof addCreditoPaymentRow>['payment'] } {
  const credito = getCreditoWithPaymentsRow(id);
  if (!credito) throw new CreditoNoEncontrado();
  if (credito.status !== 'activo') throw new CreditoNoActivo();

  const pending = credito.totalAmount - credito.paidAmount;
  if (data.amount > pending) throw new AbonoPagoExcede();

  return addCreditoPaymentRow(id, data, credito.paidAmount, credito.totalAmount, meta);
}

export function cancelCredito(id: number, meta: Meta): void {
  const credito = getCreditoWithPaymentsRow(id);
  if (!credito) throw new CreditoNoEncontrado();
  if (credito.status !== 'activo') throw new CreditoNoActivo();
  cancelCreditoRow(id, meta);
}
