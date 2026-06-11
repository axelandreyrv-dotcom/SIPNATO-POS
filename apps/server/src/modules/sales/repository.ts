import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLog, counters, sales } from '../../db/schema.js';
import type { CreateSaleInput, Sale } from '@sipnato/shared';

interface AuditMeta {
  ip: string | null;
  userAgent: string | null;
}

export function createSaleRow(
  input: CreateSaleInput,
  cashRegisterId: number,
  meta: AuditMeta,
): Sale {
  const createdAt = new Date().toISOString();

  return db.transaction((tx): Sale => {
    const counter = tx
      .update(counters)
      .set({
        currentValue: sql`${counters.currentValue} + 1`,
      })
      .where(eq(counters.type, 'sale'))
      .returning({ newValue: counters.currentValue })
      .get();

    if (!counter) throw new Error('Counter row for sale is missing — run bootstrapDb');
    const consecutive = counter.newValue;

    const row = tx
      .insert(sales)
      .values({
        cashRegisterId,
        consecutive,
        description: input.description ?? null,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        createdAt,
      })
      .returning()
      .get();

    if (!row) throw new Error('Failed to create sale');

    tx.insert(auditLog).values({
      action: 'SALE_CREATED',
      entityType: 'sale',
      entityId: String(row.id),
      payloadSnapshot: JSON.stringify({
        consecutive,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
      }),
      ip: meta.ip,
      userAgent: meta.userAgent,
    }).run();

    return {
      id: row.id,
      cashRegisterId: row.cashRegisterId,
      consecutive: row.consecutive,
      description: row.description ?? null,
      amount: row.amount,
      paymentMethod: row.paymentMethod as Sale['paymentMethod'],
      deletedAt: row.deletedAt ?? null,
      createdAt: row.createdAt,
    };
  });
}

export function findSaleById(id: number) {
  const row = db.select().from(sales).where(eq(sales.id, id)).get();
  return row ?? null;
}

export function softDeleteSaleRow(
  id: number,
  meta: AuditMeta,
  snapshot: { amount: number; paymentMethod: string },
): void {
  const deletedAt = new Date().toISOString();

  db.transaction((tx) => {
    tx.update(sales)
      .set({ deletedAt })
      .where(eq(sales.id, id))
      .run();

    tx.insert(auditLog).values({
      action: 'SALE_DELETED',
      entityType: 'sale',
      entityId: String(id),
      payloadSnapshot: JSON.stringify(snapshot),
      ip: meta.ip,
      userAgent: meta.userAgent,
    }).run();
  });
}

export function listSalesRows(
  cashRegisterId: number,
  page: number,
  limit = 50,
): { sales: Sale[]; total: number } {
  const offset = (page - 1) * limit;

  const rows = db
    .select()
    .from(sales)
    .where(and(eq(sales.cashRegisterId, cashRegisterId), isNull(sales.deletedAt)))
    .orderBy(desc(sales.createdAt), desc(sales.id))
    .limit(limit)
    .offset(offset)
    .all();

  const countRow = db
    .select({ total: count() })
    .from(sales)
    .where(and(eq(sales.cashRegisterId, cashRegisterId), isNull(sales.deletedAt)))
    .get();

  return {
    sales: rows.map((r) => ({
      id: r.id,
      cashRegisterId: r.cashRegisterId,
      consecutive: r.consecutive,
      description: r.description ?? null,
      amount: r.amount,
      paymentMethod: r.paymentMethod as Sale['paymentMethod'],
      deletedAt: r.deletedAt ?? null,
      createdAt: r.createdAt,
    })),
    total: countRow?.total ?? 0,
  };
}
