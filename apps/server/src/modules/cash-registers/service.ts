import { db } from '../../db/client.js';
import { auditLog } from '../../db/schema.js';
import { CajaNoAbierta, CajaYaAbierta } from '../../lib/errors.js';
import type { CashRegisterCurrent, CashRegisterList, CashRegisterTotals } from '@sipnato/shared';
import {
  closeCashRegisterRow,
  computeRunningTotals,
  createCashRegister,
  findCashRegisterById,
  findOpenRegister,
  listCashRegistersRows,
} from './repository.js';

interface Meta {
  ip: string | null;
  userAgent: string | null;
}

export function openCashRegister(
  openingAmount: number,
  meta: Meta,
): CashRegisterCurrent {
  const existing = findOpenRegister();
  if (existing) throw new CajaYaAbierta();

  const openedAt = new Date().toISOString();
  const id = createCashRegister(openingAmount, openedAt);

  db.insert(auditLog)
    .values({
      action: 'CASH_REGISTER_OPENED',
      entityType: 'cash_register',
      entityId: String(id),
      payloadSnapshot: JSON.stringify({ openingAmount }),
      ip: meta.ip,
      userAgent: meta.userAgent,
    })
    .run();

  return {
    id,
    openedAt,
    openingAmount,
    totals: { salesEfectivo: 0, salesTarjeta: 0, salesTransferencia: 0, salesSinpe: 0, totalSales: 0, totalExpenses: 0, netBalance: 0 },
  };
}

export function closeCashRegister(
  closeType: 'manual' | 'auto',
  closedAtOverride: string | undefined,
  meta: Meta,
): CashRegisterTotals {
  const register = findOpenRegister();
  if (!register) throw new CajaNoAbierta();

  const totals = computeRunningTotals(register.id);
  const closedAt = closedAtOverride ?? new Date().toISOString();

  closeCashRegisterRow(register.id, closedAt, closeType, totals);

  db.insert(auditLog)
    .values({
      action: 'CASH_REGISTER_CLOSED',
      entityType: 'cash_register',
      entityId: String(register.id),
      payloadSnapshot: JSON.stringify({ closeType, totals }),
      ip: meta.ip,
      userAgent: meta.userAgent,
    })
    .run();

  return totals;
}

export function getCurrentCashRegister(): CashRegisterCurrent | null {
  const register = findOpenRegister();
  if (!register) return null;

  const totals = computeRunningTotals(register.id);
  return {
    id: register.id,
    openedAt: register.openedAt,
    openingAmount: register.openingAmount,
    totals,
  };
}

export function listCashRegisters(page: number): CashRegisterList {
  const limit = 20;
  const { registers, total } = listCashRegistersRows(page, limit);
  return {
    registers,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export function getCashRegisterById(id: number) {
  return findCashRegisterById(id);
}
