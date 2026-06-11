import { CajaNoAbierta, GastoNoEnCajaActiva, GastoNoEncontrado } from '../../lib/errors.js';
import { findOpenRegister } from '../cash-registers/repository.js';
import type { CreateExpenseInput, Expense, ExpenseList } from '@sipnato/shared';
import {
  createExpenseRow,
  findExpenseById,
  listExpensesRows,
  softDeleteExpenseRow,
} from './repository.js';

interface Meta {
  ip: string | null;
  userAgent: string | null;
}

export function createExpense(input: CreateExpenseInput, meta: Meta): Expense {
  const register = findOpenRegister();
  if (!register) throw new CajaNoAbierta();

  return createExpenseRow(input, register.id, meta);
}

export function deleteExpense(id: number, meta: Meta): void {
  const register = findOpenRegister();
  if (!register) throw new CajaNoAbierta();

  const expense = findExpenseById(id);
  if (!expense || expense.deletedAt !== null) throw new GastoNoEncontrado();
  if (expense.cashRegisterId !== register.id) throw new GastoNoEnCajaActiva();

  softDeleteExpenseRow(id, meta, { description: expense.description, amount: expense.amount });
}

export function listExpenses(): ExpenseList {
  const register = findOpenRegister();

  if (!register) {
    return { expenses: [], total: 0 };
  }

  const { expenses, totalAmount } = listExpensesRows(register.id);
  return { expenses, total: totalAmount };
}
