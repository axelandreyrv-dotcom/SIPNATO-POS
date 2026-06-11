import { and, eq, isNull, sum } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLog, expenses } from '../../db/schema.js';
import type { CreateExpenseInput, Expense } from '@sipnato/shared';

interface AuditMeta {
  ip: string | null;
  userAgent: string | null;
}

function mapRow(r: typeof expenses.$inferSelect): Expense {
  return {
    id: r.id,
    cashRegisterId: r.cashRegisterId,
    description: r.description,
    amount: r.amount,
    deletedAt: r.deletedAt ?? null,
    createdAt: r.createdAt,
  };
}

export function createExpenseRow(
  input: CreateExpenseInput,
  cashRegisterId: number,
  meta: AuditMeta,
): Expense {
  const createdAt = new Date().toISOString();

  return db.transaction((tx): Expense => {
    const row = tx
      .insert(expenses)
      .values({
        cashRegisterId,
        description: input.description,
        amount: input.amount,
        createdAt,
      })
      .returning()
      .get();

    if (!row) throw new Error('Failed to create expense');

    tx.insert(auditLog).values({
      action: 'EXPENSE_CREATED',
      entityType: 'expense',
      entityId: String(row.id),
      payloadSnapshot: JSON.stringify({ description: input.description, amount: input.amount }),
      ip: meta.ip,
      userAgent: meta.userAgent,
    }).run();

    return mapRow(row);
  });
}

export function findExpenseById(id: number): Expense | null {
  const row = db.select().from(expenses).where(eq(expenses.id, id)).get();
  return row ? mapRow(row) : null;
}

export function softDeleteExpenseRow(
  id: number,
  meta: AuditMeta,
  snapshot: { description: string; amount: number },
): void {
  const deletedAt = new Date().toISOString();

  db.transaction((tx) => {
    tx.update(expenses).set({ deletedAt }).where(eq(expenses.id, id)).run();

    tx.insert(auditLog).values({
      action: 'EXPENSE_DELETED',
      entityType: 'expense',
      entityId: String(id),
      payloadSnapshot: JSON.stringify(snapshot),
      ip: meta.ip,
      userAgent: meta.userAgent,
    }).run();
  });
}

export function listExpensesRows(cashRegisterId: number): { expenses: Expense[]; totalAmount: number } {
  const rows = db
    .select()
    .from(expenses)
    .where(and(eq(expenses.cashRegisterId, cashRegisterId), isNull(expenses.deletedAt)))
    .orderBy(expenses.createdAt)
    .all();

  const sumRow = db
    .select({ total: sum(expenses.amount) })
    .from(expenses)
    .where(and(eq(expenses.cashRegisterId, cashRegisterId), isNull(expenses.deletedAt)))
    .get();

  return {
    expenses: rows.map(mapRow),
    totalAmount: Number(sumRow?.total ?? 0),
  };
}
