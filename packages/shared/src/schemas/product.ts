import { z } from 'zod';

const money = z.number().int('El monto debe ser un número entero').min(0, 'El monto no puede ser negativo');

// Código interno o código de barras. Vacío = sin código.
const productCode = z
  .string()
  .trim()
  .max(64)
  .transform((v) => (v === '' ? null : v))
  .nullable();

export const createProductSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(120),
  code: productCode.optional(),
  category: z.string().trim().max(60).transform((v) => (v === '' ? null : v)).nullable().optional(),
  price: money,
  cost: money.nullable().optional(),
  // false = servicio o artículo sin control de existencias (p. ej. "mano de obra").
  trackStock: z.boolean().default(true),
  initialStock: z.number().int().min(0).default(0),
  minStock: z.number().int().min(0).default(0),
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(120).optional(),
  code: productCode.optional(),
  category: z.string().trim().max(60).transform((v) => (v === '' ? null : v)).nullable().optional(),
  price: money.optional(),
  cost: money.nullable().optional(),
  trackStock: z.boolean().optional(),
  minStock: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

// Entrada: llegó mercadería. Ajuste: el stock real (conteo) difiere del sistema.
export const stockMovementSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('entrada'),
    quantity: z.number().int().min(1, 'La cantidad debe ser mayor a 0').max(1_000_000),
    unitCost: money.nullable().optional(),
    reason: z.string().trim().max(200).optional(),
  }),
  z.object({
    type: z.literal('ajuste'),
    // Stock contado. El servidor calcula la diferencia contra el stock del sistema.
    newStock: z.number().int().min(0, 'El stock contado no puede ser negativo').max(1_000_000),
    reason: z.string().trim().min(1, 'Indica el motivo del ajuste').max(200),
  }),
]);

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type StockMovementInput = z.infer<typeof stockMovementSchema>;

export type StockMovementType = 'entrada' | 'ajuste' | 'venta' | 'anulacion_venta';

export interface Product {
  id: number;
  name: string;
  code: string | null;
  category: string | null;
  price: number;
  // null para roles sin permiso de ver costos.
  cost: number | null;
  trackStock: boolean;
  stock: number;
  minStock: number;
  active: boolean;
}

export interface StockMovement {
  id: number;
  type: StockMovementType;
  quantity: number;
  stockAfter: number;
  unitCost: number | null;
  reason: string | null;
  saleId: number | null;
  username: string | null;
  createdAt: string;
}

export function isLowStock(p: Pick<Product, 'trackStock' | 'stock' | 'minStock'>): boolean {
  return p.trackStock && p.stock <= p.minStock;
}
