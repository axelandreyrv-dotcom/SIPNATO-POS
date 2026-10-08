import { count, eq, like, or } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { boletas, customers } from '../../db/schema.js';
import type { BoletaSummary, Customer, CustomerList } from '@sipnato/shared';

function mapCustomer(r: typeof customers.$inferSelect): Customer {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email ?? null,
    address: r.address ?? null,
    idNumber: r.idNumber ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function findCustomerById(id: number): Customer | null {
  const row = db.select().from(customers).where(eq(customers.id, id)).get();
  return row ? mapCustomer(row) : null;
}

export function listCustomersRows(q: string, page: number, limit: number): CustomerList {
  const offset = (page - 1) * limit;

  const condition = q
    ? or(
        like(customers.name, `%${q}%`),
        like(customers.phone, `%${q}%`),
        like(customers.idNumber, `%${q}%`),
      )
    : undefined;

  const rows = db
    .select()
    .from(customers)
    .where(condition)
    .orderBy(customers.name)
    .limit(limit)
    .offset(offset)
    .all();

  const countRow = db.select({ total: count() }).from(customers).where(condition).get();
  const total = countRow?.total ?? 0;

  return {
    customers: rows.map(mapCustomer),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export function getCustomerBoletasRows(customerId: number): BoletaSummary[] {
  const rows = db
    .select({
      id: boletas.id,
      consecutive: boletas.consecutive,
      deviceModel: boletas.deviceModel,
      fields: boletas.fields,
      description: boletas.description,
      createdAt: boletas.createdAt,
    })
    .from(boletas)
    .where(eq(boletas.customerId, customerId))
    .orderBy(boletas.createdAt)
    .all();

  return rows.map((r) => ({
    id: r.id,
    consecutive: r.consecutive,
    deviceModel: r.deviceModel,
    fields: JSON.parse(r.fields) as BoletaSummary['fields'],
    description: r.description,
    createdAt: r.createdAt,
  }));
}
