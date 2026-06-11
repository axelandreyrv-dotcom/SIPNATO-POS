import { count, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { cashRegisters, sales, expenses } from '../../db/schema.js';
import type { CashRegisterTotals, CashRegisterSummary } from '@sipnato/shared';

export function findOpenRegister() {
  const rows = db
    .select()
    .from(cashRegisters)
    .where(isNull(cashRegisters.closedAt))
    .limit(1)
    .all();
  return rows[0] ?? null;
}

export function createCashRegister(openingAmount: number, openedAt: string): number {
  const result = db
    .insert(cashRegisters)
    .values({ openingAmount, openedAt })
    .returning({ id: cashRegisters.id })
    .get();
  if (!result) throw new Error('Failed to create cash register');
  return result.id;
}

export function computeRunningTotals(cashRegisterId: number): CashRegisterTotals {
  const salesRows = db
    .select({
      paymentMethod: sales.paymentMethod,
      total: sql<number>`COALESCE(SUM(${sales.amount}), 0)`,
    })
    .from(sales)
    .where(
      sql`${sales.cashRegisterId} = ${cashRegisterId} AND ${sales.deletedAt} IS NULL`,
    )
    .groupBy(sales.paymentMethod)
    .all();

  const expRow = db
    .select({ total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
    .from(expenses)
    .where(
      sql`${expenses.cashRegisterId} = ${cashRegisterId} AND ${expenses.deletedAt} IS NULL`,
    )
    .get();

  const totals: CashRegisterTotals = {
    salesEfectivo: 0,
    salesTarjeta: 0,
    salesTransferencia: 0,
    salesSinpe: 0,
    totalSales: 0,
    totalExpenses: expRow?.total ?? 0,
    netBalance: 0,
  };

  for (const row of salesRows) {
    const amount = Number(row.total);
    totals.totalSales += amount;
    if (row.paymentMethod === 'efectivo') totals.salesEfectivo = amount;
    else if (row.paymentMethod === 'tarjeta') totals.salesTarjeta = amount;
    else if (row.paymentMethod === 'transferencia') totals.salesTransferencia = amount;
    else if (row.paymentMethod === 'sinpe') totals.salesSinpe = amount;
  }

  totals.netBalance = totals.totalSales - totals.totalExpenses;
  return totals;
}

export function closeCashRegisterRow(
  id: number,
  closedAt: string,
  closeType: 'manual' | 'auto',
  totals: CashRegisterTotals,
): void {
  db.update(cashRegisters)
    .set({
      closedAt,
      closeType,
      totalSalesCash: totals.salesEfectivo,
      totalSalesCard: totals.salesTarjeta,
      totalSalesTransfer: totals.salesTransferencia,
      totalSalesSinpe: totals.salesSinpe,
      totalExpenses: totals.totalExpenses,
      netBalance: totals.netBalance,
    })
    .where(eq(cashRegisters.id, id))
    .run();
}

export function listCashRegistersRows(
  page: number,
  limit = 20,
): { registers: CashRegisterSummary[]; total: number } {
  const offset = (page - 1) * limit;

  const rows = db
    .select({
      id: cashRegisters.id,
      openedAt: cashRegisters.openedAt,
      closedAt: cashRegisters.closedAt,
      closeType: cashRegisters.closeType,
      openingAmount: cashRegisters.openingAmount,
      netBalance: cashRegisters.netBalance,
    })
    .from(cashRegisters)
    .orderBy(desc(cashRegisters.openedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const countRow = db.select({ total: count() }).from(cashRegisters).get();

  return {
    registers: rows.map((row) => ({
      id: row.id,
      openedAt: row.openedAt,
      closedAt: row.closedAt ?? null,
      closeType: (row.closeType ?? null) as 'manual' | 'auto' | null,
      openingAmount: row.openingAmount,
      netBalance: row.netBalance ?? null,
    })),
    total: countRow?.total ?? 0,
  };
}

export function findCashRegisterById(id: number) {
  return db
    .select()
    .from(cashRegisters)
    .where(eq(cashRegisters.id, id))
    .get() ?? null;
}
