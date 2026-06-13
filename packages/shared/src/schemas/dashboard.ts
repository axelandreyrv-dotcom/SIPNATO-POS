import type { PaymentMethod } from './sale.js';

export type DashboardWeeklyEntry = {
  date: string; // CR calendar day, YYYY-MM-DD
  total: number;
  count: number;
};

export type DashboardMovement = {
  id: number;
  type: 'sale' | 'expense';
  description: string | null;
  amount: number; // always positive; the sign is implied by `type`
  paymentMethod: PaymentMethod | null; // sales only; null for expenses
  createdAt: string; // UTC ISO
};

export type DashboardApartado = {
  id: number;
  customerName: string;
  description: string;
  totalAmount: number;
  paidAmount: number;
};

export type DashboardData = {
  cashRegister: {
    isOpen: boolean;
    openedAt: string | null;
    openingAmount: number;
  };
  today: {
    salesCount: number;
    totalSales: number;
    byPaymentMethod: {
      efectivo: number;
      tarjeta: number;
      transferencia: number;
      sinpe: number;
    };
    totalExpenses: number;
    netBalance: number;
    boletasCount: number;
    // Percent change of totalSales vs yesterday. null when yesterday had no sales
    // (a delta against zero is meaningless, not "infinite").
    salesDeltaPct: number | null;
  };
  weekly: DashboardWeeklyEntry[]; // exactly 7 entries, oldest first, last is today
  recentMovements: DashboardMovement[]; // up to 8, newest first
  apartados: {
    activeCount: number;
    totalOwed: number;
    top: DashboardApartado[]; // up to 3, largest outstanding balance first
  };
};
