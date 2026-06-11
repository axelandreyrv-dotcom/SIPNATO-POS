import { z } from 'zod';

export const createExpenseSchema = z.object({
  description: z.string().min(1, 'La descripción es requerida').max(500),
  amount: z.number().int().min(1, 'El monto debe ser mayor a 0'),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export type Expense = {
  id: number;
  cashRegisterId: number;
  description: string;
  amount: number;
  deletedAt: string | null;
  createdAt: string;
};

export type ExpenseList = {
  expenses: Expense[];
  total: number;
};
