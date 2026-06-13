import { and, count, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { apartados, boletas, cashRegisters, expenses, sales } from '../../db/schema.js';
import { crDayRangeToUtc, todayCR } from '../../lib/cr-time.js';
import type { DashboardData, DashboardMovement } from '@sipnato/shared';

// Pure calendar arithmetic on a YYYY-MM-DD string. No timezone involved:
// parsing/formatting through UTC midnight keeps the date stable.
function crDateMinus(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

export function getDashboardData(): DashboardData {
  const openRegister = db
    .select({ openedAt: cashRegisters.openedAt, openingAmount: cashRegisters.openingAmount })
    .from(cashRegisters)
    .where(isNull(cashRegisters.closedAt))
    .get();

  const today = todayCR();
  const { fromUtc, toUtc } = crDayRangeToUtc(today, today);

  // ── Today: sales by payment method ──────────────────────────────────────────
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

  // ── Today: expenses + boletas ───────────────────────────────────────────────
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

  // ── Delta vs yesterday ──────────────────────────────────────────────────────
  const yesterday = crDateMinus(today, 1);
  const { fromUtc: yFrom, toUtc: yTo } = crDayRangeToUtc(yesterday, yesterday);
  const yRow = db
    .select({ total: sql<number>`COALESCE(SUM(${sales.amount}), 0)` })
    .from(sales)
    .where(and(isNull(sales.deletedAt), gte(sales.createdAt, yFrom), lte(sales.createdAt, yTo)))
    .get();
  const yesterdayTotalSales = yRow?.total ?? 0;
  const salesDeltaPct =
    yesterdayTotalSales > 0
      ? ((totalSales - yesterdayTotalSales) / yesterdayTotalSales) * 100
      : null;

  // ── Last 7 CR days ──────────────────────────────────────────────────────────
  const weekStart = crDateMinus(today, 6);
  const { fromUtc: wFrom, toUtc: wTo } = crDayRangeToUtc(weekStart, today);
  const crDay = sql<string>`strftime('%Y-%m-%d', datetime(${sales.createdAt}, '-6 hours'))`;
  const weekRows = db
    .select({
      date: crDay,
      total: sql<number>`COALESCE(SUM(${sales.amount}), 0)`,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(sales)
    .where(and(isNull(sales.deletedAt), gte(sales.createdAt, wFrom), lte(sales.createdAt, wTo)))
    .groupBy(crDay)
    .all();
  const weekMap = new Map(weekRows.map((r) => [r.date, r]));
  const weekly = [];
  for (let i = 6; i >= 0; i--) {
    const d = crDateMinus(today, i);
    const row = weekMap.get(d);
    weekly.push({ date: d, total: row?.total ?? 0, count: row?.cnt ?? 0 });
  }

  // ── Recent movements (sales + expenses merged) ──────────────────────────────
  const recentSales = db
    .select({
      id: sales.id,
      description: sales.description,
      amount: sales.amount,
      paymentMethod: sales.paymentMethod,
      createdAt: sales.createdAt,
    })
    .from(sales)
    .where(isNull(sales.deletedAt))
    .orderBy(desc(sales.createdAt), desc(sales.id))
    .limit(8)
    .all();

  const recentExpenses = db
    .select({
      id: expenses.id,
      description: expenses.description,
      amount: expenses.amount,
      createdAt: expenses.createdAt,
    })
    .from(expenses)
    .where(isNull(expenses.deletedAt))
    .orderBy(desc(expenses.createdAt), desc(expenses.id))
    .limit(8)
    .all();

  const recentMovements: DashboardMovement[] = [
    ...recentSales.map((s) => ({
      id: s.id,
      type: 'sale' as const,
      description: s.description,
      amount: s.amount,
      paymentMethod: s.paymentMethod,
      createdAt: s.createdAt,
    })),
    ...recentExpenses.map((e) => ({
      id: e.id,
      type: 'expense' as const,
      description: e.description,
      amount: e.amount,
      paymentMethod: null,
      createdAt: e.createdAt,
    })),
  ]
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      if (a.id !== b.id) return b.id - a.id;
      return a.type < b.type ? 1 : -1;
    })
    .slice(0, 8);

  // ── Apartados por cobrar (active layaways with outstanding balance) ─────────
  const activeApartados = db
    .select({
      id: apartados.id,
      customerName: apartados.customerName,
      description: apartados.description,
      totalAmount: apartados.totalAmount,
      paidAmount: sql<number>`coalesce((select sum(amount) from apartado_payments where apartado_id = ${apartados.id}), 0)`,
    })
    .from(apartados)
    .where(and(eq(apartados.status, 'activo'), isNull(apartados.deletedAt)))
    .all();

  let totalOwed = 0;
  for (const a of activeApartados) {
    totalOwed += Math.max(0, a.totalAmount - a.paidAmount);
  }

  const topApartados = activeApartados
    .map((a) => ({ ...a, saldo: a.totalAmount - a.paidAmount }))
    .filter((a) => a.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, 3)
    .map((a) => ({
      id: a.id,
      customerName: a.customerName,
      description: a.description,
      totalAmount: a.totalAmount,
      paidAmount: a.paidAmount,
    }));

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
      salesDeltaPct,
    },
    weekly,
    recentMovements,
    apartados: {
      activeCount: activeApartados.filter((a) => a.totalAmount - a.paidAmount > 0).length,
      totalOwed,
      top: topApartados,
    },
  };
}
