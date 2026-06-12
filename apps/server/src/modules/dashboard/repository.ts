import { and, count, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { boletas, cashRegisters, expenses, sales } from '../../db/schema.js';
import { crDayRangeToUtc, todayCR } from '../../lib/cr-time.js';
import type { DashboardData } from '@sipnato/shared';

export function getDashboardData(): DashboardData {
  const openRegister = db
    .select({ openedAt: cashRegisters.openedAt, openingAmount: cashRegisters.openingAmount })
    .from(cashRegisters)
    .where(isNull(cashRegisters.closedAt))
    .get();

  const today = todayCR();
  const { fromUtc, toUtc } = crDayRangeToUtc(today, today);

  const aggRows = db
    .select({
      paymentMethod: sales.paymentMethod,
      total: sql<number>`SUM(${sales.amount})`,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(sales)
    .where(and(isNull(sales.deletedAt), gte(sales.createdAt, fromUtc), lte(sales.createdAt, toUtc)))
    .groupBy(sales.paymentMethod)
    .all();

  const byPaymentMethod = { efectivo: 0, tarjeta: 0, transferencia: 0, sinpe: 0 };
  let totalSales = 0;
  let salesCount = 0;
  for (const row of aggRows) {
    const method = row.paymentMethod as keyof typeof byPaymentMethod;
    if (method in byPaymentMethod) byPaymentMethod[method] = row.total;
    totalSales += row.total;
    salesCount += row.cnt;
  }

  const expRow = db
    .select({ total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
    .from(expenses)
    .where(and(isNull(expenses.deletedAt), gte(expenses.createdAt, fromUtc), lte(expenses.createdAt, toUtc)))
    .get();
  const totalExpenses = expRow?.total ?? 0;

  const boletasRow = db
    .select({ cnt: count() })
    .from(boletas)
    .where(and(gte(boletas.createdAt, fromUtc), lte(boletas.createdAt, toUtc)))
    .get();
  const boletasCount = boletasRow?.cnt ?? 0;

  return {
    cashRegister: {
      isOpen: !!openRegister,
      openedAt: openRegister?.openedAt ?? null,
      openingAmount: openRegister?.openingAmount ?? 0,
    },
    today: {
      salesCount,
      totalSales,
      byPaymentMethod,
      totalExpenses,
      netBalance: totalSales - totalExpenses,
      boletasCount,
    },
  };
}
