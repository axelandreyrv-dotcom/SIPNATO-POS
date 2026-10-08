import type {
  CreateProductInput,
  Product,
  StockMovement,
  StockMovementInput,
  UpdateProductInput,
} from '@sipnato/shared';
import {
  CodigoProductoDuplicado,
  ProductoNoEncontrado,
  ProductoSinControlStock,
} from '../../lib/errors.js';
import {
  countLowStock,
  findProductByCode,
  findProductById,
  insertProductRow,
  listMovementRows,
  listProductRows,
  recordAdjustmentRow,
  recordEntryRow,
  updateProductRow,
  type ProductFilter,
  type ProductRow,
} from './repository.js';

interface Meta {
  ip: string | null;
  userAgent: string | null;
}

// El costo solo se envía a quien puede verlo (admin/dueño): el cajero no ve márgenes.
export function toProduct(row: ProductRow, showCost: boolean): Product {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    category: row.category,
    price: row.price,
    cost: showCost ? row.cost : null,
    trackStock: row.trackStock,
    stock: row.stock,
    minStock: row.minStock,
    active: row.active,
  };
}

function getOrThrow(id: number): ProductRow {
  const row = findProductById(id);
  if (!row) throw new ProductoNoEncontrado();
  return row;
}

function assertCodeFree(code: string | null | undefined, exceptId?: number): void {
  if (!code) return;
  const existing = findProductByCode(code);
  if (existing && existing.id !== exceptId) throw new CodigoProductoDuplicado();
}

export function listProducts(q: string | undefined, filter: ProductFilter, showCost: boolean) {
  return {
    products: listProductRows(q, filter).map((r) => toProduct(r, showCost)),
    lowStockCount: countLowStock(),
  };
}

// Lector de código de barras: coincidencia exacta, solo productos activos.
export function lookupByCode(code: string, showCost: boolean): Product | null {
  const row = findProductByCode(code.trim());
  return row && row.active ? toProduct(row, showCost) : null;
}

export function createProduct(input: CreateProductInput, meta: Meta): Product {
  assertCodeFree(input.code);
  const row = insertProductRow(
    {
      name: input.name,
      code: input.code ?? null,
      category: input.category ?? null,
      price: input.price,
      cost: input.cost ?? null,
      trackStock: input.trackStock,
      minStock: input.minStock,
    },
    input.trackStock ? input.initialStock : 0,
    meta,
  );
  return toProduct(row, true);
}

export function updateProduct(id: number, input: UpdateProductInput, meta: Meta): Product {
  const before = getOrThrow(id);
  assertCodeFree(input.code, id);

  // Solo los campos enviados (exactOptionalPropertyTypes no admite `undefined` explícito).
  const changes = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined),
  ) as Parameters<typeof updateProductRow>[1];

  // Precio anterior en la bitácora: los cambios de precio son lo que más se audita.
  const snapshot = {
    ...changes,
    ...(changes.price !== undefined && changes.price !== before.price
      ? { priceBefore: before.price }
      : {}),
  };
  return toProduct(updateProductRow(id, changes, snapshot, meta), true);
}

export function recordMovement(id: number, input: StockMovementInput, meta: Meta): Product {
  const product = getOrThrow(id);
  if (!product.trackStock) throw new ProductoSinControlStock();

  const row =
    input.type === 'entrada'
      ? recordEntryRow(product, input.quantity, input.unitCost, input.reason, meta)
      : recordAdjustmentRow(product, input.newStock, input.reason, meta);
  return toProduct(row, true);
}

export function listMovements(id: number): StockMovement[] {
  getOrThrow(id);
  return listMovementRows(id);
}
