import { apiFetch } from '../../lib/api-client';
import type { CreateExpenseInput, Expense, ExpenseList, SupervisorAuth } from '@sipnato/shared';

export const expensesApi = {
  create(data: CreateExpenseInput): Promise<Expense> {
    return apiFetch<Expense>('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // `authorization`: credenciales de un admin/dueño cuando quien elimina es un cajero.
  delete(id: number, authorization?: SupervisorAuth): Promise<{ ok: boolean }> {
    return apiFetch<{ ok: boolean }>(`/api/expenses/${id}`, {
      method: 'DELETE',
      body: JSON.stringify(authorization ? { authorization } : {}),
    });
  },

  list(): Promise<ExpenseList> {
    return apiFetch<ExpenseList>('/api/expenses');
  },
};
