import { z } from 'zod';

export const createCreditoSchema = z.object({
  debtorName: z.string().min(1).max(200),
  debtorPhone: z.string().min(1).max(20),
  description: z.string().min(1).max(500),
  totalAmount: z.number().int().min(1),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .refine((v) => !isNaN(new Date(v).getTime()), { message: 'Fecha inválida' }),
});

export const addCreditoPaymentSchema = z.object({
  amount: z.number().int().min(1),
  note: z.string().max(300).optional(),
});

export type CreateCredito = z.infer<typeof createCreditoSchema>;
export type AddCreditoPayment = z.infer<typeof addCreditoPaymentSchema>;

export type CreditoPayment = {
  id: number;
  creditoId: number;
  amount: number;
  note: string | null;
  createdAt: string;
};

export type Credito = {
  id: number;
  consecutive: number;
  debtorName: string;
  debtorPhone: string;
  description: string;
  totalAmount: number;
  paidAmount: number;
  dueDate: string;
  status: 'activo' | 'pagado' | 'cancelado';
  createdAt: string;
  updatedAt: string;
};

export type CreditoWithPayments = Credito & {
  payments: CreditoPayment[];
};

export type CreditoList = {
  creditos: Credito[];
};
