import { count, desc, eq, like, or, sql } from 'drizzle-orm';
import { currentActorId, db } from '../../db/client.js';
import { auditLog, boletas, counters, customers } from '../../db/schema.js';
import type {
  BoletaList,
  BoletaWithCustomer,
  CreateBoletaInput,
  OrderFieldValue,
} from '@sipnato/shared';

interface AuditMeta {
  ip: string | null;
  userAgent: string | null;
}

const boletaColumns = {
  id: boletas.id,
  customerId: boletas.customerId,
  consecutive: boletas.consecutive,
  deviceModel: boletas.deviceModel,
  fields: boletas.fields,
  description: boletas.description,
  createdAt: boletas.createdAt,
  updatedAt: boletas.updatedAt,
  customerName: customers.name,
  customerPhone: customers.phone,
};

type BoletaJoinRow = {
  [K in keyof typeof boletaColumns]: (typeof boletaColumns)[K]['_']['data'];
};

function parseFields(json: string): OrderFieldValue[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as OrderFieldValue[]) : [];
  } catch {
    return [];
  }
}

function toBoleta(r: BoletaJoinRow): BoletaWithCustomer {
  return { ...r, fields: parseFields(r.fields) };
}

// `fields` llega ya validado contra el perfil del negocio (service).
export function createBoletaRow(
  input: Omit<CreateBoletaInput, 'fields'>,
  fields: OrderFieldValue[],
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

    const row = tx
      .insert(boletas)
      .values({
        customerId: customer.id,
        consecutive,
        deviceModel: input.deviceModel,
        fields: JSON.stringify(fields),
        description: input.description,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    if (!row) throw new Error('Failed to create boleta');

    tx.insert(auditLog)
      .values({
        action: 'BOLETA_CREATED',
        entityType: 'boleta',
        entityId: String(row.id),
        // Sin los valores de los campos: pueden incluir contraseñas de equipos de clientes.
        payloadSnapshot: JSON.stringify({
          consecutive,
          customerId: customer.id,
          customerPhone: input.customerPhone,
          deviceModel: input.deviceModel,
        }),
        ip: meta.ip,
        userAgent: meta.userAgent,
        userId: currentActorId(),
      })
      .run();

    return toBoleta({ ...row, customerName: customer.name, customerPhone: customer.phone });
  });
}

export function findBoletaById(id: number): BoletaWithCustomer | null {
  const row = db
    .select(boletaColumns)
    .from(boletas)
    .innerJoin(customers, eq(boletas.customerId, customers.id))
    .where(eq(boletas.id, id))
    .get();

  return row ? toBoleta(row) : null;
}

export function listBoletasRows(q: string, page: number, limit: number): BoletaList {
  const offset = (page - 1) * limit;

  const consecutiveNum = q && /^\d+$/.test(q.trim()) ? parseInt(q.trim(), 10) : null;

  // `fields` es JSON en texto: el LIKE encuentra placas, IMEI, números de serie...
  const condition = q
    ? or(
        like(customers.name, `%${q}%`),
        like(customers.phone, `%${q}%`),
        like(boletas.deviceModel, `%${q}%`),
        like(boletas.fields, `%${q}%`),
        consecutiveNum !== null ? eq(boletas.consecutive, consecutiveNum) : undefined,
      )
    : undefined;

  const rows = db
    .select(boletaColumns)
    .from(boletas)
    .innerJoin(customers, eq(boletas.customerId, customers.id))
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
    boletas: rows.map(toBoleta),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
