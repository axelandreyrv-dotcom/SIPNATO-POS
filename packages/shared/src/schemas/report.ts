import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
  .refine((val) => !isNaN(new Date(val).getTime()), 'Fecha inválida');

const dateRangeMax1Year = (data: { from: string; to: string }): boolean => {
  const from = new Date(data.from);
  const to = new Date(data.to);
  const maxMs = 366 * 24 * 60 * 60 * 1000;
  return from <= to && to.getTime() - from.getTime() <= maxMs;
};

export const reportSummaryFilterSchema = z
  .object({
    from: isoDate,
    to: isoDate,
  })
  .refine(dateRangeMax1Year, { message: 'Rango inválido: desde ≤ hasta, máximo 1 año' });

export const reportExportFilterSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    paymentMethod: z.enum(['efectivo', 'tarjeta', 'transferencia', 'sinpe']).optional(),
    q: z.string().max(200).optional(),
  })
  .refine(dateRangeMax1Year, { message: 'Rango inválido: desde ≤ hasta, máximo 1 año' });

export const reportSalesFilterSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    paymentMethod: z.enum(['efectivo', 'tarjeta', 'transferencia', 'sinpe']).optional(),
    q: z.string().max(200).optional(),
    page: z.coerce.number().int().min(1).default(1),
  })
  .refine(dateRangeMax1Year, { message: 'Rango inválido: desde ≤ hasta, máximo 1 año' });

export type ReportSummaryFilter = z.infer<typeof reportSummaryFilterSchema>;
export type ReportExportFilter = z.infer<typeof reportExportFilterSchema>;
export type ReportSalesFilter = z.infer<typeof reportSalesFilterSchema>;

export type PaymentMethodTotals = {
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  sinpe: number;
};

export type ReportSummary = {
  saleCount: number;
  totalSales: number;
  byPaymentMethod: PaymentMethodTotals;
  totalExpenses: number;
  netBalance: number;
};

export type DailyEntry = {
  date: string; // YYYY-MM-DD en hora CR
  total: number;
  count: number;
};

export type ReportSaleRow = {
  id: number;
  cashRegisterId: number;
  consecutive: number;
  description: string | null;
  amount: number;
  paymentMethod: string;
  createdAt: string;
};

export type ReportSaleList = {
  sales: ReportSaleRow[];
  total: number;
  page: number;
  totalPages: number;
};
