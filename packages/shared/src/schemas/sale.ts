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

// 'dolares': efectivo recibido en USD. La venta se registra en colones; el servidor
// convierte con el tipo de cambio vigente y calcula el vuelto en colones.
export const PAYMENT_METHODS = [
  'efectivo',
  'tarjeta',
  'transferencia',
  'sinpe',
  'dolares',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  sinpe: 'SINPE',
  dolares: 'Dólares',
};

// Dos formas de vender: monto libre (como siempre) o carrito con líneas.
// Con `items`, el total lo calcula el servidor y `amount` se ignora.
export const createSaleSchema = z
  .object({
    description: z.string().max(500).optional(),
    amount: z.number().int().min(1, 'El monto debe ser mayor a 0').optional(),
    items: z.array(saleItemInputSchema).min(1).max(100).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS),
    // Solo con paymentMethod 'dolares': USD recibidos, en centavos.
    usdReceivedCents: z.number().int().min(1).max(100_000_000).optional(),
  })
  .refine((d) => d.items !== undefined || d.amount !== undefined, {
    message: 'Indica un monto o agrega productos',
    path: ['amount'],
  })
  .refine((d) => d.paymentMethod !== 'dolares' || d.usdReceivedCents !== undefined, {
    message: 'Indica cuántos dólares se recibieron',
    path: ['usdReceivedCents'],
  });

export type SaleItemInput = z.infer<typeof saleItemInputSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

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
  // Solo en ventas pagadas con dólares: USD recibidos (centavos), tipo de cambio
  // usado (centésimas de colón) y vuelto entregado en colones.
  usdReceivedCents: number | null;
  exchangeRate: number | null;
  changeColones: number | null;
};

// Tipo de cambio vigente para recibir dólares. `rate` = tipo de compra del BCCR o, si no
// está disponible, el de respaldo que configuró el negocio.
export type ExchangeRateInfo = {
  rate: number | null;
  source: 'bccr' | 'manual' | null;
  date: string | null;
  bccrBuy: number | null;
  bccrSell: number | null;
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
