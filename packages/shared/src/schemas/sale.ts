import { z } from 'zod';

// Línea de producto: el precio lo pone el servidor desde el catálogo, nunca el cliente.
// Línea libre (sin productId): descripción y precio los indica quien cobra.
export const saleItemInputSchema = z.union([
  z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().min(1, 'La cantidad debe ser mayor a 0').max(10_000),
  }),
  z.object({
    description: z.string().trim().min(1, 'La línea necesita una descripción').max(200),
    quantity: z.number().int().min(1).max(10_000),
    unitPrice: z.number().int().min(1, 'El monto debe ser mayor a 0'),
  }),
]);

// Dos formas de vender: monto libre (como siempre) o carrito con líneas.
// Con `items`, el total lo calcula el servidor y `amount` se ignora.
export const createSaleSchema = z
  .object({
    description: z.string().max(500).optional(),
    amount: z.number().int().min(1, 'El monto debe ser mayor a 0').optional(),
    items: z.array(saleItemInputSchema).min(1).max(100).optional(),
    paymentMethod: z.enum(['efectivo', 'tarjeta', 'transferencia', 'sinpe']),
  })
  .refine((d) => d.items !== undefined || d.amount !== undefined, {
    message: 'Indica un monto o agrega productos',
    path: ['amount'],
  });

export type SaleItemInput = z.infer<typeof saleItemInputSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'sinpe';

export type SaleItem = {
  productId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type Sale = {
  id: number;
  cashRegisterId: number;
  consecutive: number;
  description: string | null;
  amount: number;
  paymentMethod: PaymentMethod;
  deletedAt: string | null;
  createdAt: string;
  // Vacío en ventas de monto libre.
  items: SaleItem[];
};

// Productos que quedaron con stock negativo tras la venta ("avisar y permitir").
export type CreateSaleResult = Sale & {
  stockWarnings: { productId: number; name: string; stock: number }[];
};

export type SaleList = {
  sales: Sale[];
  total: number;
  page: number;
  totalPages: number;
};
