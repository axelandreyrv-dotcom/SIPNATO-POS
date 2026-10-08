import { z } from 'zod';

export const openCashRegisterSchema = z.object({
  openingAmount: z.number().int().min(0),
});

export type OpenCashRegisterInput = z.infer<typeof openCashRegisterSchema>;

export type CashRegisterTotals = {
  salesEfectivo: number;
  salesTarjeta: number;
  salesTransferencia: number;
  salesSinpe: number;
  // Ventas pagadas con dólares, valoradas en colones al tipo de cambio de cada venta.
  salesDolares: number;
  totalSales: number;
  totalExpenses: number;
  netBalance: number;
  // Dólares físicos en caja (centavos) y vueltos en colones que salieron por esas ventas.
  usdReceivedCents: number;
  usdChangeColones: number;
};

export type CashRegisterCurrent = {
  id: number;
  openedAt: string;
  openingAmount: number;
  totals: CashRegisterTotals;
};

export type CashRegisterSummary = {
  id: number;
  openedAt: string;
  closedAt: string | null;
  closeType: 'manual' | 'auto' | null;
  openingAmount: number;
  netBalance: number | null;
};

export type CashRegisterList = {
  registers: CashRegisterSummary[];
  total: number;
  page: number;
  totalPages: number;
};
