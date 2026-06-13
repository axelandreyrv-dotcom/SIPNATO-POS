import { and, count, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLog, counters, facturaItems, facturas } from '../../db/schema.js';
import type { CreateFacturaInput, Factura, FacturaItem, FacturaWithItems } from '@sipnato/shared';

type Meta = { ip: string; userAgent?: string };

export function listFacturasRows(page: number, search?: string): { data: Factura[]; total: number } {
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  const where = search
    ? or(
        like(facturas.clientName, `%${search}%`),
        like(facturas.clientCedula, `%${search}%`),
        sql`cast(${facturas.consecutive} as text) LIKE ${'%' + search + '%'}`,
      )
    : undefined;

  const rows = db
    .select()
    .from(facturas)
    .where(where)
    .orderBy(desc(facturas.consecutive))
    .limit(pageSize)
    .offset(offset)
    .all() as Factura[];

  const totalRow = db.select({ cnt: count() }).from(facturas).where(where).get();

  return { data: rows, total: totalRow?.cnt ?? 0 };
}

export function getFacturaRow(id: number): FacturaWithItems | undefined {
  const factura = db.select().from(facturas).where(eq(facturas.id, id)).get() as Factura | undefined;
  if (!factura) return undefined;

  const items = db
    .select()
    .from(facturaItems)
    .where(eq(facturaItems.facturaId, id))
    .orderBy(facturaItems.sortOrder)
    .all() as FacturaItem[];

  return { ...factura, items };
}

export function insertFacturaRow(input: CreateFacturaInput, meta: Meta): FacturaWithItems {
  const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const ivaAmount = Math.round((subtotal * input.ivaPercent) / 100);
  const total = subtotal + ivaAmount;

  return db.transaction(() => {
    const updated = db
      .update(counters)
      .set({ currentValue: sql`${counters.currentValue} + 1` })
      .where(eq(counters.type, 'factura'))
      .returning({ consecutive: counters.currentValue })
      .get();

    if (!updated) throw new Error('Counter factura no encontrado');
    const consecutive = updated.consecutive;

    const factura = db
      .insert(facturas)
      .values({
        consecutive,
        date: input.date,
        clientName: input.clientName,
        clientCedula: input.clientCedula ?? null,
        ivaPercent: input.ivaPercent,
        subtotal,
        ivaAmount,
        total,
      })
      .returning()
      .get() as Factura;

    const items = input.items.map((item, i) => {
      const inserted = db
        .insert(facturaItems)
        .values({
          facturaId: factura.id,
          quantity: item.quantity,
          description: item.description,
          unitPrice: item.unitPrice,
          total: item.quantity * item.unitPrice,
          sortOrder: i,
        })
        .returning()
        .get() as FacturaItem;
      return inserted;
    });

    db.insert(auditLog)
      .values({
        action: 'FACTURA_CREATED',
        entityType: 'factura',
        entityId: String(factura.id),
        payloadSnapshot: JSON.stringify({ consecutive, total, clientName: input.clientName }),
        ip: meta.ip,
        userAgent: meta.userAgent ?? null,
      })
      .run();

    return { ...factura, items };
  });
}

export function anularFacturaRow(id: number, meta: Meta): Factura {
  return db.transaction(() => {
    const factura = db.select().from(facturas).where(eq(facturas.id, id)).get() as Factura | undefined;
    if (!factura) throw new Error('NOT_FOUND');
    if (factura.status === 'anulada') throw new Error('YA_ANULADA');

    const updated = db
      .update(facturas)
      .set({ status: 'anulada', updatedAt: sql`(datetime('now'))` })
      .where(eq(facturas.id, id))
      .returning()
      .get() as Factura;

    db.insert(auditLog)
      .values({
        action: 'FACTURA_ANULADA',
        entityType: 'factura',
        entityId: String(id),
        payloadSnapshot: JSON.stringify({ consecutive: factura.consecutive }),
        ip: meta.ip,
        userAgent: meta.userAgent ?? null,
      })
      .run();

    return updated;
  });
}
