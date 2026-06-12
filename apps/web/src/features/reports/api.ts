import { apiFetch } from '../../lib/api-client';
import type { DailyEntry, ReportSaleList, ReportSaleRow, ReportSummary } from '@sipnato/shared';

export const reportsApi = {
  getSummary(from: string, to: string): Promise<ReportSummary> {
    return apiFetch<ReportSummary>(`/api/reports/summary?from=${from}&to=${to}`);
  },

  getDaily(from: string, to: string): Promise<DailyEntry[]> {
    return apiFetch<DailyEntry[]>(`/api/reports/daily?from=${from}&to=${to}`);
  },

  getSales(
    from: string,
    to: string,
    options?: { paymentMethod?: string; q?: string; page?: number },
  ): Promise<ReportSaleList> {
    const sp = new URLSearchParams({ from, to });
    if (options?.paymentMethod) sp.set('paymentMethod', options.paymentMethod);
    if (options?.q) sp.set('q', options.q);
    if (options?.page) sp.set('page', String(options.page));
    return apiFetch<ReportSaleList>(`/api/reports/sales?${sp.toString()}`);
  },

  exportSales(
    from: string,
    to: string,
    options?: { paymentMethod?: string; q?: string },
  ): Promise<ReportSaleRow[]> {
    const sp = new URLSearchParams({ from, to });
    if (options?.paymentMethod) sp.set('paymentMethod', options.paymentMethod);
    if (options?.q) sp.set('q', options.q);
    return apiFetch<ReportSaleRow[]>(`/api/reports/sales/export?${sp.toString()}`);
  },
};
