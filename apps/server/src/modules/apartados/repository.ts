import { eq, sql, isNull, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { apartados, apartadoPayments, counters, auditLog } from '../../db/schema.js';
import type { CreateApartadoInput, AddApartadoPaymentInput, Apartado, ApartadoPayment, ApartadoWithPayments } from '@sipnato/shared';

type PaymentDbRow = typeof apartadoPayments.$inferSelect;
type ApartadoDbRow = typeof apartados.$inferSelect;

type ApartadoRow = ApartadoDbRow & { paidAmount: number };

function mapPaymentRow(row: PaymentDbRow): ApartadoPayment {
  return {
    id: row.id,
    apartadoId: row.apartadoId,
    amount: row.amount,
    paymentMethod: row.paymentMethod as ApartadoPayment['paymentMethod'],
    note: row.note,
    createdAt: row.createdAt,
  };
}

function mapApartadoRow(row: ApartadoRow): Apartado {
  return {
    id: row.id,
    consecutive: row.consecutive,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    description: row.description,
    totalAmount: row.totalAmount,
    paidAmount: row.paidAmount,
    status: row.status as Apartado['status'],
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function insertApartadoRow(
  data: CreateApartadoInput,
  meta: { ip?: string; userAgent?: string },
): Apartado {
  return db.transaction((tx) => {
    const counter = tx
      .update(counters)
      .set({ currentValue: sql`${counters.currentValue} + 1` })
      .where(eq(counters.type, 'apartado'))
      .returning({ currentValue: counters.currentValue })
      .get();

    if (!counter) throw new Error('Counter apartado no encontrado');
    const consecutive = counter.currentValue;

    const row = tx
      .insert(apartados)
      .values({
        consecutive,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        description: data.description,
        totalAmount: data.totalAmount,
        notes: data.notes ?? null,
        status: 'activo',
      })
      .returning()
      .get();

    if (data.depositAmount > 0) {
      tx.insert(apartadoPayments)
        .values({
          apartadoId: row.id,
          amount: data.depositAmount,
          paymentMethod: data.depositMethod,
        })
        .run();
    }

    tx.insert(auditLog)
      .values({
        action: 'APARTADO_CREATED',
        entityType: 'apartado',
        entityId: String(row.id),
        payloadSnapshot: JSON.stringify({
          consecutive,
          customerName: data.customerName,
          totalAmount: data.totalAmount,
          depositAmount: data.depositAmount,
        }),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      })
      .run();

    return mapApartadoRow({ ...row, paidAmount: data.depositAmount });
  });
}

export function listApartadosRows(filter?: {
  status?: string;
  search?: string;
}): { data: Apartado[]; total: number } {
  const rows = db
    .select({
      id: apartados.id,
      consecutive: apartados.consecutive,
      customerName: apartados.customerName,
      customerPhone: apartados.customerPhone,
      description: apartados.description,
      totalAmount: apartados.totalAmount,
      paidAmount: sql<number>`coalesce((select sum(amount) from apartado_payments where apartado_id = ${apartados.id}), 0)`,
      status: apartados.status,
      notes: apartados.notes,
      deletedAt: apartados.deletedAt,
      createdAt: apartados.createdAt,
      updatedAt: apartados.updatedAt,
    })
    .from(apartados)
    .where(isNull(apartados.deletedAt))
    .orderBy(desc(apartados.createdAt))
    .all();

  let filtered = rows;

  if (filter?.status && filter.status !== 'todos') {
    filtered = filtered.filter((r) => r.status === filter.status);
  }

  if (filter?.search) {
    const q = filter.search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.customerName.toLowerCase().includes(q) ||
        r.customerPhone.includes(q) ||
        r.description.toLowerCase().includes(q),
    );
  }

  return {
    data: filtered.map((r) => mapApartadoRow(r as ApartadoRow)),
    total: filtered.length,
  };
}

export function getApartadoWithPaymentsRow(id: number): ApartadoWithPayments | null {
  const row = db
    .select({
      id: apartados.id,
      consecutive: apartados.consecutive,
      customerName: apartados.customerName,
      customerPhone: apartados.customerPhone,
      description: apartados.description,
      totalAmount: apartados.totalAmount,
      paidAmount: sql<number>`coalesce((select sum(amount) from apartado_payments where apartado_id = ${apartados.id}), 0)`,
      status: apartados.status,
      notes: apartados.notes,
      deletedAt: apartados.deletedAt,
      createdAt: apartados.createdAt,
      updatedAt: apartados.updatedAt,
    })
    .from(apartados)
    .where(eq(apartados.id, id))
    .get();

  if (!row || row.deletedAt) return null;

  const payments = db
    .select()
    .from(apartadoPayments)
    .where(eq(apartadoPayments.apartadoId, id))
    .orderBy(desc(apartadoPayments.createdAt))
    .all()
    .map(mapPaymentRow);

  return {
    ...mapApartadoRow(row as ApartadoRow),
    payments,
  };
}

export function addPaymentRow(
  apartadoId: number,
  data: AddApartadoPaymentInput,
  meta: { ip?: string; userAgent?: string },
): { apartado: Apartado; newPaidAmount: number } {
  return db.transaction((tx) => {
    tx.insert(apartadoPayments)
      .values({
        apartadoId,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        note: data.note ?? null,
      })
      .run();

    const paidResult = tx
      .select({ paidAmount: sql<number>`coalesce(sum(amount), 0)` })
      .from(apartadoPayments)
      .where(eq(apartadoPayments.apartadoId, apartadoId))
      .get();

    const newPaidAmount = paidResult?.paidAmount ?? 0;

    const apRow = tx.select().from(apartados).where(eq(apartados.id, apartadoId)).get()!;
    const newStatus = newPaidAmount >= apRow.totalAmount ? 'completado' : 'activo';

    const updatedRow = tx
      .update(apartados)
      .set({
        status: newStatus,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(apartados.id, apartadoId))
      .returning()
      .get()!;

    tx.insert(auditLog)
      .values({
        action: 'APARTADO_PAYMENT_ADDED',
        entityType: 'apartado',
        entityId: String(apartadoId),
        payloadSnapshot: JSON.stringify({
          amount: data.amount,
          paymentMethod: data.paymentMethod,
          newPaidAmount,
          newStatus,
        }),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      })
      .run();

    return {
      apartado: mapApartadoRow({ ...updatedRow, paidAmount: newPaidAmount }),
      newPaidAmount,
    };
  });
}

export function cancelApartadoRow(
  id: number,
  meta: { ip?: string; userAgent?: string },
): Apartado {
  return db.transaction((tx) => {
    const row = tx
      .update(apartados)
      .set({ status: 'cancelado', updatedAt: new Date().toISOString() })
      .where(eq(apartados.id, id))
      .returning()
      .get();

    if (!row) throw new Error('Apartado no encontrado');

    const paidResult = tx
      .select({ paidAmount: sql<number>`coalesce(sum(amount), 0)` })
      .from(apartadoPayments)
      .where(eq(apartadoPayments.apartadoId, id))
      .get();

    tx.insert(auditLog)
      .values({
        action: 'APARTADO_CANCELLED',
        entityType: 'apartado',
        entityId: String(id),
        payloadSnapshot: JSON.stringify({ consecutive: row.consecutive }),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      })
      .run();

    return mapApartadoRow({ ...row, paidAmount: paidResult?.paidAmount ?? 0 });
  });
}
