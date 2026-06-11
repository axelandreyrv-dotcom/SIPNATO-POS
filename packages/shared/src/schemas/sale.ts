import { z } from 'zod';

export const createSaleSchema = z.object({
  description: z.string().max(500).optional(),
  amount: z.number().int().min(1, 'El monto debe ser mayor a 0'),
  paymentMethod: z.enum(['efectivo', 'tarjeta', 'transferencia', 'sinpe']),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'sinpe';

export type Sale = {
  id: number;
  cashRegisterId: number;
  consecutive: number;
  description: string | null;
  amount: number;
  paymentMethod: PaymentMethod;
  deletedAt: string | null;
  createdAt: string;
};

export type SaleList = {
  sales: Sale[];
  total: number;
  page: number;
  totalPages: number;
};
