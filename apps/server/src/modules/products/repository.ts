import { and, asc, desc, eq, like, lte, or, sql } from 'drizzle-orm';
import { currentActorId, db, type TenantDb } from '../../db/client.js';
import { auditLog, products, stockMovements, users } from '../../db/schema.js';

export type ProductRow = typeof products.$inferSelect;
export type Tx = Parameters<Parameters<TenantDb['transaction']>[0]>[0];
type MovementType = (typeof stockMovements.$inferInsert)['type'];

interface AuditMeta {
  ip: string | null;
  userAgent: string | null;
}

export type ProductFilter = 'activos' | 'stock-bajo' | 'inactivos';

export function listProductRows(
  q: string | undefined,
  filter: ProductFilter,
  limit = 200,
): ProductRow[] {
  const term = q?.trim();
  const conditions = [
    filter === 'inactivos' ? eq(products.active, false) : eq(products.active, true),
    ...(filter === 'stock-bajo'
      ? [eq(products.trackStock, true), lte(products.stock, products.minStock)]
      : []),
    ...(term
      ? [
          or(
            like(products.name, `%${term}%`),
            like(products.code, `%${term}%`),
            like(products.category, `%${term}%`),
          )!,
        ]
      : []),
  ];

  return db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(asc(products.name))
    .limit(limit)
    .all();
}

export function findProductById(id: number): ProductRow | null {
  return db.select().from(products).where(eq(products.id, id)).get() ?? null;
}

export function findProductByCode(code: string): ProductRow | null {
  return db.select().from(products).where(eq(products.code, code)).get() ?? null;
}

export function countLowStock(): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(products)
    .where(
      and(
        eq(products.active, true),
        eq(products.trackStock, true),
        lte(products.stock, products.minStock),
      ),
    )
    .get();
  return row?.n ?? 0;
}

// Único punto que modifica `products.stock`: suma `delta` y deja el movimiento con el saldo
// resultante, dentro de la transacción del llamador (venta, entrada, ajuste...).
export function applyStockChange(
  tx: Tx,
  change: {
    productId: number;
    delta: number;
    type: MovementType;
    unitCost?: number | null;
    reason?: string | null;
    saleId?: number | null;
  },
): number {
  const updated = tx
    .update(products)
    .set({ stock: sql`${products.stock} + ${change.delta}`, updatedAt: new Date().toISOString() })
    .where(eq(products.id, change.productId))
    .returning({ stock: products.stock })
    .get();
  if (!updated) throw new Error(`Producto ${change.productId} no existe`);

  tx.insert(stockMovements)
    .values({
      productId: change.productId,
      type: change.type,
      quantity: change.delta,
      stockAfter: updated.stock,
      unitCost: change.unitCost ?? null,
      reason: change.reason ?? null,
      saleId: change.saleId ?? null,
      userId: currentActorId(),
      // ISO con 'Z': el default datetime('now') de SQLite es UTC sin zona y el navegador
      // lo interpretaría como hora local (6 h de diferencia en Costa Rica).
      createdAt: new Date().toISOString(),
    })
    .run();

  return updated.stock;
}

function audit(
  tx: Tx,
  action: string,
  productId: number,
  snapshot: Record<string, unknown>,
  meta: AuditMeta,
): void {
  tx.insert(auditLog)
    .values({
      action,
      entityType: 'product',
      entityId: String(productId),
      payloadSnapshot: JSON.stringify(snapshot),
      ip: meta.ip,
      userAgent: meta.userAgent,
      userId: currentActorId(),
    })
    .run();
}

export function insertProductRow(
  values: Omit<typeof products.$inferInsert, 'id' | 'stock' | 'createdAt' | 'updatedAt'>,
  initialStock: number,
  meta: AuditMeta,
): ProductRow {
  return db.transaction((tx) => {
    const row = tx.insert(products).values(values).returning().get();
    if (!row) throw new Error('Error al crear producto');

    if (row.trackStock && initialStock > 0) {
      applyStockChange(tx, {
        productId: row.id,
        delta: initialStock,
        type: 'entrada',
        unitCost: row.cost,
        reason: 'Inventario inicial',
      });
    }
    audit(tx, 'PRODUCT_CREATED', row.id, { name: row.name, price: row.price, initialStock }, meta);
    return tx.select().from(products).where(eq(products.id, row.id)).get()!;
  });
}

export function updateProductRow(
  id: number,
  changes: Partial<Omit<typeof products.$inferInsert, 'id' | 'stock' | 'createdAt' | 'updatedAt'>>,
  snapshot: Record<string, unknown>,
  meta: AuditMeta,
): ProductRow {
  return db.transaction((tx) => {
    tx.update(products)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where(eq(products.id, id))
      .run();
    audit(tx, 'PRODUCT_UPDATED', id, snapshot, meta);
    return tx.select().from(products).where(eq(products.id, id)).get()!;
  });
}

export function recordEntryRow(
  product: ProductRow,
  quantity: number,
  unitCost: number | null | undefined,
  reason: string | undefined,
  meta: AuditMeta,
): ProductRow {
  return db.transaction((tx) => {
    const stockAfter = applyStockChange(tx, {
      productId: product.id,
      delta: quantity,
      type: 'entrada',
      unitCost: unitCost ?? null,
      reason: reason ?? null,
    });
    // El costo del producto pasa a ser el de la última compra.
    if (unitCost !== undefined && unitCost !== null) {
      tx.update(products).set({ cost: unitCost }).where(eq(products.id, product.id)).run();
    }
    audit(tx, 'STOCK_ENTRY', product.id, { quantity, unitCost, stockAfter }, meta);
    return tx.select().from(products).where(eq(products.id, product.id)).get()!;
  });
}

export function recordAdjustmentRow(
  product: ProductRow,
  newStock: number,
  reason: string,
  meta: AuditMeta,
): ProductRow {
  return db.transaction((tx) => {
    // Diferencia calculada dentro de la transacción: si se vendió algo entre que se contó
    // y se guardó el ajuste, el saldo final igual queda en lo contado.
    const current = tx
      .select({ stock: products.stock })
      .from(products)
      .where(eq(products.id, product.id))
      .get()!;
    const delta = newStock - current.stock;
    applyStockChange(tx, { productId: product.id, delta, type: 'ajuste', reason });
    audit(
      tx,
      'STOCK_ADJUSTED',
      product.id,
      { before: current.stock, after: newStock, reason },
      meta,
    );
    return tx.select().from(products).where(eq(products.id, product.id)).get()!;
  });
}

export function listMovementRows(productId: number, limit = 100) {
  return db
    .select({
      id: stockMovements.id,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      stockAfter: stockMovements.stockAfter,
      unitCost: stockMovements.unitCost,
      reason: stockMovements.reason,
      saleId: stockMovements.saleId,
      username: users.username,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .leftJoin(users, eq(users.id, stockMovements.userId))
    .where(eq(stockMovements.productId, productId))
    .orderBy(desc(stockMovements.id))
    .limit(limit)
    .all();
}
