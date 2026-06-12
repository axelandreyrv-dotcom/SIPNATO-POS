import type {
  DailyEntry,
  ReportExportFilter,
  ReportSaleList,
  ReportSaleRow,
  ReportSummary,
  ReportSalesFilter,
  ReportSummaryFilter,
} from '@sipnato/shared';
import type { SalesQueryParams } from './repository.js';
import {
  exportReportSales,
  getReportDaily,
  getReportSummary,
  listReportSales,
} from './repository.js';

export function getSalesList(filter: ReportSalesFilter): ReportSaleList {
  const params: SalesQueryParams = { from: filter.from, to: filter.to, page: filter.page };
  if (filter.paymentMethod !== undefined) params.paymentMethod = filter.paymentMethod;
  if (filter.q !== undefined) params.q = filter.q;
  return listReportSales(params);
}

export function getSalesExport(filter: ReportExportFilter): ReportSaleRow[] {
  const params: Omit<SalesQueryParams, 'page'> = { from: filter.from, to: filter.to };
  if (filter.paymentMethod !== undefined) params.paymentMethod = filter.paymentMethod;
  if (filter.q !== undefined) params.q = filter.q;
  return exportReportSales(params);
}

export function getSummary(filter: ReportSummaryFilter): ReportSummary {
  return getReportSummary(filter.from, filter.to);
}

export function getDaily(filter: ReportSummaryFilter): DailyEntry[] {
  return getReportDaily(filter.from, filter.to);
}
