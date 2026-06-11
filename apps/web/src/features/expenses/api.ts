import { apiFetch } from '../../lib/api-client';
import type { CreateExpenseInput, Expense, ExpenseList } from '@sipnato/shared';

export const expensesApi = {
  create(data: CreateExpenseInput): Promise<Expense> {
    return apiFetch<Expense>('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  delete(id: number): Promise<{ ok: boolean }> {
    return apiFetch<{ ok: boolean }>(`/api/expenses/${id}`, {
      method: 'DELETE',
    });
  },

  list(): Promise<ExpenseList> {
    return apiFetch<ExpenseList>('/api/expenses');
  },
};
