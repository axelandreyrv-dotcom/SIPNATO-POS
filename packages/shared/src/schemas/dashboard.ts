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
  };
};
