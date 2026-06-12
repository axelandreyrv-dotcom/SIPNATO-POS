import { and, count, gte, isNull, like, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { expenses, sales } from '../../db/schema.js';
import { crDayRangeToUtc } from '../../lib/cr-time.js';
import type {
  DailyEntry,
  PaymentMethod,
  PaymentMethodTotals,
  ReportSaleList,
  ReportSaleRow,
  ReportSummary,
} from '@sipnato/shared';

function mapSaleRow(r: typeof sales.$inferSelect): ReportSaleRow {
  return {
    id: r.id,
    cashRegisterId: r.cashRegisterId,
    consecutive: r.consecutive,
    description: r.description ?? null,
    amount: r.amount,
    paymentMethod: r.paymentMethod,
    createdAt: r.createdAt,
  };
}

export interface SalesQueryParams {
  from: string;
  to: string;
  paymentMethod?: PaymentMethod;
  q?: string;
  page: number;
}

const REPORT_PAGE_SIZE = 50;
const EXPORT_MAX = 5000;

export function listReportSales(params: SalesQueryParams): ReportSaleList {
  const { fromUtc, toUtc } = crDayRangeToUtc(params.from, params.to);
  const offset = (params.page - 1) * REPORT_PAGE_SIZE;

  const conditions = [
    isNull(sales.deletedAt),
    gte(sales.createdAt, fromUtc),
    lte(sales.createdAt, toUtc),
    ...(params.paymentMethod ? [sql`${sales.paymentMethod} = ${params.paymentMethod}`] : []),
    ...(params.q ? [like(sales.description, `%${params.q}%`)] : []),
  ];

  const where = and(...conditions);

  const rows = db
    .select()
    .from(sales)
    .where(where)
    .orderBy(sql`${sales.createdAt} DESC`, sql`${sales.id} DESC`)
    .limit(REPORT_PAGE_SIZE)
    .offset(offset)
    .all();

  const countRow = db.select({ total: count() }).from(sales).where(where).get();
  const total = countRow?.total ?? 0;

  return {
    sales: rows.map(mapSaleRow),
    total,
    page: params.page,
    totalPages: Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE)),
  };
}

export function exportReportSales(
  params: Omit<SalesQueryParams, 'page'>,
): ReportSaleRow[] {
  const { fromUtc, toUtc } = crDayRangeToUtc(params.from, params.to);

  const conditions = [
    isNull(sales.deletedAt),
    gte(sales.createdAt, fromUtc),
    lte(sales.createdAt, toUtc),
    ...(params.paymentMethod ? [sql`${sales.paymentMethod} = ${params.paymentMethod}`] : []),
    ...(params.q ? [like(sales.description, `%${params.q}%`)] : []),
  ];

  return db
    .select()
    .from(sales)
    .where(and(...conditions))
    .orderBy(sql`${sales.createdAt} DESC`, sql`${sales.id} DESC`)
    .limit(EXPORT_MAX)
    .all()
    .map(mapSaleRow);
}

export function getReportSummary(from: string, to: string): ReportSummary {
  const { fromUtc, toUtc } = crDayRangeToUtc(from, to);

  const salesWhere = and(
    isNull(sales.deletedAt),
    gte(sales.createdAt, fromUtc),
    lte(sales.createdAt, toUtc),
  );

  const aggRows = db
    .select({
      paymentMethod: sales.paymentMethod,
      total: sql<number>`SUM(${sales.amount})`,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(sales)
    .where(salesWhere)
    .groupBy(sales.paymentMethod)
    .all();

  const byPaymentMethod: PaymentMethodTotals = {
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
    sinpe: 0,
  };

  let totalSales = 0;
  let saleCount = 0;
  for (const row of aggRows) {
    const method = row.paymentMethod as PaymentMethod;
    if (method in byPaymentMethod) {
      byPaymentMethod[method] = row.total;
    }
    totalSales += row.total;
    saleCount += row.cnt;
  }

  const expenseSumRow = db
    .select({ total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
    .from(expenses)
    .where(
      and(
        isNull(expenses.deletedAt),
        gte(expenses.createdAt, fromUtc),
        lte(expenses.createdAt, toUtc),
      ),
    )
    .get();

  const totalExpenses = expenseSumRow?.total ?? 0;

  return {
    saleCount,
    totalSales,
    byPaymentMethod,
    totalExpenses,
    netBalance: totalSales - totalExpenses,
  };
}

export function getReportDaily(from: string, to: string): DailyEntry[] {
  const { fromUtc, toUtc } = crDayRangeToUtc(from, to);

  // Group sales by CR calendar day using SQLite's datetime offset.
  const crDay = sql<string>`strftime('%Y-%m-%d', datetime(${sales.createdAt}, '-6 hours'))`;

  const rows = db
    .select({
      date: crDay,
      total: sql<number>`COALESCE(SUM(${sales.amount}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(sales)
    .where(
      and(
        isNull(sales.deletedAt),
        gte(sales.createdAt, fromUtc),
        lte(sales.createdAt, toUtc),
      ),
    )
    .groupBy(crDay)
    .orderBy(crDay)
    .all();

  return rows.map((r) => ({
    date: r.date,
    total: r.total,
    count: r.count,
  }));
}
