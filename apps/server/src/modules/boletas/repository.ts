import { count, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLog, boletas, counters, customers } from '../../db/schema.js';
import type {
  Boleta,
  BoletaList,
  BoletaWithCustomer,
  CreateBoletaInput,
} from '@sipnato/shared';
import { createCustomerRow, findCustomerByPhone } from '../customers/repository.js';

function mapBoleta(r: typeof boletas.$inferSelect): Boleta {
  return {
    id: r.id,
    customerId: r.customerId,
    consecutive: r.consecutive,
    deviceModel: r.deviceModel,
    imei: r.imei ?? null,
    unlockPassword: r.unlockPassword ?? null,
    description: r.description,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

interface AuditMeta {
  ip: string | null;
  userAgent: string | null;
}

export function createBoletaRow(
  input: CreateBoletaInput,
  meta: AuditMeta,
): BoletaWithCustomer {
  const now = new Date().toISOString();

  return db.transaction((tx): BoletaWithCustomer => {
    // Find or create customer by phone
    let customer = tx
      .select()
      .from(customers)
      .where(eq(customers.phone, input.customerPhone))
      .get();

    if (!customer) {
      const inserted = tx
        .insert(customers)
        .values({
          name: input.customerName,
          phone: input.customerPhone,
          email: input.customerEmail ?? null,
          address: null,
          idNumber: input.customerIdNumber ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      if (!inserted) throw new Error('Failed to create customer');
      customer = inserted;
    }

    // Increment boleta counter
    const counter = tx
      .update(counters)
      .set({ currentValue: sql`${counters.currentValue} + 1` })
      .where(eq(counters.type, 'boleta'))
      .returning({ newValue: counters.currentValue })
      .get();

    if (!counter) throw new Error('Counter row for boleta is missing — run bootstrapDb');
    const consecutive = counter.newValue;

    // Create boleta
    const row = tx
      .insert(boletas)
      .values({
        customerId: customer.id,
        consecutive,
        deviceModel: input.deviceModel,
        imei: input.imei ?? null,
        unlockPassword: input.unlockPassword ?? null,
        description: input.description,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    if (!row) throw new Error('Failed to create boleta');

    tx.insert(auditLog).values({
      action: 'BOLETA_CREATED',
      entityType: 'boleta',
      entityId: String(row.id),
      payloadSnapshot: JSON.stringify({
        consecutive,
        customerId: customer.id,
        customerPhone: input.customerPhone,
        deviceModel: input.deviceModel,
        imei: input.imei ?? null,
      }),
      ip: meta.ip,
      userAgent: meta.userAgent,
    }).run();

    return {
      ...mapBoleta(row),
      customerName: customer.name,
      customerPhone: customer.phone,
    };
  });
}

export function findBoletaById(id: number): BoletaWithCustomer | null {
  const row = db
    .select({
      id: boletas.id,
      customerId: boletas.customerId,
      consecutive: boletas.consecutive,
      deviceModel: boletas.deviceModel,
      imei: boletas.imei,
      unlockPassword: boletas.unlockPassword,
      description: boletas.description,
      createdAt: boletas.createdAt,
      updatedAt: boletas.updatedAt,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(boletas)
    .innerJoin(customers, eq(boletas.customerId, customers.id))
    .where(eq(boletas.id, id))
    .get();

  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customerId,
    consecutive: row.consecutive,
    deviceModel: row.deviceModel,
    imei: row.imei ?? null,
    unlockPassword: row.unlockPassword ?? null,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
  };
}

export function listBoletasRows(q: string, page: number, limit: number): BoletaList {
  const offset = (page - 1) * limit;

  const consecutiveNum = q && /^\d+$/.test(q.trim()) ? parseInt(q.trim(), 10) : null;

  const condition = q
    ? or(
        like(customers.name, `%${q}%`),
        like(customers.phone, `%${q}%`),
        like(boletas.imei, `%${q}%`),
        consecutiveNum !== null ? eq(boletas.consecutive, consecutiveNum) : undefined,
      )
    : undefined;

  const baseQuery = db
    .select({
      id: boletas.id,
      customerId: boletas.customerId,
      consecutive: boletas.consecutive,
      deviceModel: boletas.deviceModel,
      imei: boletas.imei,
      unlockPassword: boletas.unlockPassword,
      description: boletas.description,
      createdAt: boletas.createdAt,
      updatedAt: boletas.updatedAt,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(boletas)
    .innerJoin(customers, eq(boletas.customerId, customers.id));

  const rows = baseQuery
    .where(condition)
    .orderBy(desc(boletas.createdAt), desc(boletas.id))
    .limit(limit)
    .offset(offset)
    .all();

  const countRow = db
    .select({ total: count() })
    .from(boletas)
    .innerJoin(customers, eq(boletas.customerId, customers.id))
    .where(condition)
    .get();

  const total = countRow?.total ?? 0;

  return {
    boletas: rows.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      consecutive: r.consecutive,
      deviceModel: r.deviceModel,
      imei: r.imei ?? null,
      unlockPassword: r.unlockPassword ?? null,
      description: r.description,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export { findCustomerByPhone, createCustomerRow };
