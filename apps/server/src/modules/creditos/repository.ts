import { eq, sql, isNull, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { creditos, creditoPayments, counters, auditLog } from '../../db/schema.js';
import type { CreateCredito, AddCreditoPayment, Credito, CreditoPayment, CreditoWithPayments } from '@sipnato/shared';

type CreditoDbRow = typeof creditos.$inferSelect;
type PaymentDbRow = typeof creditoPayments.$inferSelect;
type CreditoRow = CreditoDbRow & { paidAmount: number };

function mapPaymentRow(row: PaymentDbRow): CreditoPayment {
  return {
    id: row.id,
    creditoId: row.creditoId,
    amount: row.amount,
    note: row.note,
    createdAt: row.createdAt,
  };
}

function mapCreditoRow(row: CreditoRow): Credito {
  return {
    id: row.id,
    consecutive: row.consecutive,
    debtorName: row.debtorName,
    debtorPhone: row.debtorPhone,
    description: row.description,
    totalAmount: row.totalAmount,
    paidAmount: row.paidAmount,
    dueDate: row.dueDate,
    status: row.status as Credito['status'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function insertCreditoRow(
  data: CreateCredito,
  meta: { ip?: string; userAgent?: string },
): Credito {
  return db.transaction((tx) => {
    const counter = tx
      .update(counters)
      .set({ currentValue: sql`${counters.currentValue} + 1` })
      .where(eq(counters.type, 'credito'))
      .returning({ currentValue: counters.currentValue })
      .get();

    if (!counter) throw new Error('Counter credito no encontrado');
    const consecutive = counter.currentValue;
    const now = new Date().toISOString();

    const row = tx
      .insert(creditos)
      .values({
        consecutive,
        debtorName: data.debtorName,
        debtorPhone: data.debtorPhone,
        description: data.description,
        totalAmount: data.totalAmount,
        dueDate: data.dueDate,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    tx.insert(auditLog).values({
      action: 'CREDITO_CREATED',
      entityType: 'credito',
      entityId: String(row.id),
      payloadSnapshot: JSON.stringify(data),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    }).run();

    return mapCreditoRow({ ...row, paidAmount: 0 });
  });
}

export function listCreditoRows(status?: string, search?: string): Credito[] {
  const paidSubquery = db
    .select({ creditoId: creditoPayments.creditoId, paidAmount: sql<number>`COALESCE(SUM(${creditoPayments.amount}), 0)` })
    .from(creditoPayments)
    .groupBy(creditoPayments.creditoId)
    .as('paid');

  let query = db
    .select({
      id: creditos.id,
      consecutive: creditos.consecutive,
      debtorName: creditos.debtorName,
      debtorPhone: creditos.debtorPhone,
      description: creditos.description,
      totalAmount: creditos.totalAmount,
      paidAmount: sql<number>`COALESCE(${paidSubquery.paidAmount}, 0)`,
      dueDate: creditos.dueDate,
      status: creditos.status,
      deletedAt: creditos.deletedAt,
      createdAt: creditos.createdAt,
      updatedAt: creditos.updatedAt,
    })
    .from(creditos)
    .leftJoin(paidSubquery, eq(creditos.id, paidSubquery.creditoId))
    .where(isNull(creditos.deletedAt))
    .orderBy(desc(creditos.createdAt));

  const rows = query.all();

  return rows
    .filter((r) => {
      if (status && r.status !== status) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.debtorName.toLowerCase().includes(q) ||
          r.debtorPhone.includes(q)
        );
      }
      return true;
    })
    .map((r) => mapCreditoRow(r as CreditoRow));
}

export function getCreditoWithPaymentsRow(id: number): CreditoWithPayments | null {
  const paidSubquery = db
    .select({ creditoId: creditoPayments.creditoId, paidAmount: sql<number>`COALESCE(SUM(${creditoPayments.amount}), 0)` })
    .from(creditoPayments)
    .groupBy(creditoPayments.creditoId)
    .as('paid');

  const row = db
    .select({
      id: creditos.id,
      consecutive: creditos.consecutive,
      debtorName: creditos.debtorName,
      debtorPhone: creditos.debtorPhone,
      description: creditos.description,
      totalAmount: creditos.totalAmount,
      paidAmount: sql<number>`COALESCE(${paidSubquery.paidAmount}, 0)`,
      dueDate: creditos.dueDate,
      status: creditos.status,
      deletedAt: creditos.deletedAt,
      createdAt: creditos.createdAt,
      updatedAt: creditos.updatedAt,
    })
    .from(creditos)
    .leftJoin(paidSubquery, eq(creditos.id, paidSubquery.creditoId))
    .where(eq(creditos.id, id))
    .get();

  if (!row || row.deletedAt) return null;

  const payments = db
    .select()
    .from(creditoPayments)
    .where(eq(creditoPayments.creditoId, id))
    .orderBy(desc(creditoPayments.createdAt))
    .all()
    .map(mapPaymentRow);

  return { ...mapCreditoRow(row as CreditoRow), payments };
}

export function addCreditoPaymentRow(
  creditoId: number,
  data: AddCreditoPayment,
  currentPaid: number,
  totalAmount: number,
  meta: { ip?: string; userAgent?: string },
): { credito: Credito; payment: CreditoPayment } {
  return db.transaction((tx) => {
    const now = new Date().toISOString();
    const newPaid = currentPaid + data.amount;
    const newStatus = newPaid >= totalAmount ? 'pagado' : 'activo';

    const payment = tx
      .insert(creditoPayments)
      .values({
        creditoId,
        amount: data.amount,
        note: data.note ?? null,
        createdAt: now,
      })
      .returning()
      .get();

    if (newStatus === 'pagado') {
      tx.update(creditos)
        .set({ status: 'pagado', updatedAt: now })
        .where(eq(creditos.id, creditoId))
        .run();
    } else {
      tx.update(creditos)
        .set({ updatedAt: now })
        .where(eq(creditos.id, creditoId))
        .run();
    }

    tx.insert(auditLog).values({
      action: 'CREDITO_PAYMENT_ADDED',
      entityType: 'credito',
      entityId: String(creditoId),
      payloadSnapshot: JSON.stringify({ amount: data.amount, note: data.note, newPaid, newStatus }),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    }).run();

    const updated = tx
      .select()
      .from(creditos)
      .where(eq(creditos.id, creditoId))
      .get()!;

    return {
      credito: mapCreditoRow({ ...updated, paidAmount: newPaid }),
      payment: mapPaymentRow(payment),
    };
  });
}

export function cancelCreditoRow(
  id: number,
  meta: { ip?: string; userAgent?: string },
): void {
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(creditos)
      .set({ status: 'cancelado', deletedAt: now, updatedAt: now })
      .where(eq(creditos.id, id))
      .run();

    tx.insert(auditLog).values({
      action: 'CREDITO_CANCELLED',
      entityType: 'credito',
      entityId: String(id),
      payloadSnapshot: null,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    }).run();
  });
}
