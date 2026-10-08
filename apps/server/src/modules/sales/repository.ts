import { and, asc, count, desc, eq, inArray, isNull, isNotNull, sql } from 'drizzle-orm';
import { currentActorId, db } from '../../db/client.js';
import { auditLog, counters, products, saleItems, sales } from '../../db/schema.js';
import type { CreateSaleResult, PaymentMethod, Sale, SaleItem } from '@sipnato/shared';
import { applyStockChange } from '../products/repository.js';

interface AuditMeta {
  ip: string | null;
  userAgent: string | null;
}

// Línea ya resuelta por el service: precio y costo tomados del catálogo para productos.
export interface ResolvedSaleItem {
  productId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number | null;
  total: number;
  trackStock: boolean;
}

type SaleRow = typeof sales.$inferSelect;

function toSale(row: SaleRow, items: SaleItem[]): Sale {
  return {
    id: row.id,
    cashRegisterId: row.cashRegisterId,
    consecutive: row.consecutive,
    description: row.description ?? null,
    amount: row.amount,
    paymentMethod: row.paymentMethod as PaymentMethod,
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt,
    items,
  };
}

export function createSaleRow(
  input: { description: string | null; amount: number; paymentMethod: PaymentMethod; items: ResolvedSaleItem[] },
  cashRegisterId: number,
  meta: AuditMeta,
): CreateSaleResult {
  const createdAt = new Date().toISOString();

  return db.transaction((tx): CreateSaleResult => {
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
        description: input.description,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        createdAt,
      })
      .returning()
      .get();

    if (!row) throw new Error('Failed to create sale');

    // Líneas + descuento de stock en la misma transacción que la venta: o pasa todo o nada.
    const stockWarnings: CreateSaleResult['stockWarnings'] = [];
    input.items.forEach((item, sortOrder) => {
      tx.insert(saleItems).values({
        saleId: row.id,
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost,
        total: item.total,
        sortOrder,
      }).run();

      if (item.productId !== null && item.trackStock) {
        const stock = applyStockChange(tx, {
          productId: item.productId,
          delta: -item.quantity,
          type: 'venta',
          saleId: row.id,
        });
        // Vender sin stock registrado se permite pero se avisa.
        if (stock < 0) stockWarnings.push({ productId: item.productId, name: item.description, stock });
      }
    });

    tx.insert(auditLog).values({
      action: 'SALE_CREATED',
      entityType: 'sale',
      entityId: String(row.id),
      payloadSnapshot: JSON.stringify({
        consecutive,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        ...(input.items.length > 0 ? { items: input.items.length } : {}),
      }),
      ip: meta.ip,
      userAgent: meta.userAgent,
      userId: currentActorId(),
    }).run();

    const items: SaleItem[] = input.items.map((i) => ({
      productId: i.productId,
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      total: i.total,
    }));
    return { ...toSale(row, items), stockWarnings };
  });
}

export function findSaleById(id: number) {
  const row = db.select().from(sales).where(eq(sales.id, id)).get();
  return row ?? null;
}

// Eliminar una venta devuelve al inventario lo que se había descontado.
export function softDeleteSaleRow(
  id: number,
  meta: AuditMeta,
  snapshot: Record<string, unknown>,
): void {
  const deletedAt = new Date().toISOString();

  db.transaction((tx) => {
    tx.update(sales)
      .set({ deletedAt })
      .where(eq(sales.id, id))
      .run();

    const stockLines = tx
      .select({ productId: saleItems.productId, quantity: saleItems.quantity })
      .from(saleItems)
      .innerJoin(products, eq(products.id, saleItems.productId))
      .where(and(eq(saleItems.saleId, id), isNotNull(saleItems.productId), eq(products.trackStock, true)))
      .all();

    for (const line of stockLines) {
      applyStockChange(tx, {
        productId: line.productId!,
        delta: line.quantity,
        type: 'anulacion_venta',
        saleId: id,
      });
    }

    tx.insert(auditLog).values({
      action: 'SALE_DELETED',
      entityType: 'sale',
      entityId: String(id),
      payloadSnapshot: JSON.stringify(snapshot),
      ip: meta.ip,
      userAgent: meta.userAgent,
      userId: currentActorId(),
    }).run();
  });
}

function itemsBySale(saleIds: number[]): Map<number, SaleItem[]> {
  const map = new Map<number, SaleItem[]>();
  if (saleIds.length === 0) return map;

  const rows = db
    .select()
    .from(saleItems)
    .where(inArray(saleItems.saleId, saleIds))
    .orderBy(asc(saleItems.saleId), asc(saleItems.sortOrder))
    .all();

  for (const r of rows) {
    const list = map.get(r.saleId) ?? [];
    list.push({
      productId: r.productId,
      description: r.description,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      total: r.total,
    });
    map.set(r.saleId, list);
  }
  return map;
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

  const items = itemsBySale(rows.map((r) => r.id));
  return {
    sales: rows.map((r) => toSale(r, items.get(r.id) ?? [])),
    total: countRow?.total ?? 0,
  };
}
