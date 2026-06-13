import { z } from 'zod';

export const APARTADO_PAYMENT_METHODS = ['efectivo', 'tarjeta', 'transferencia', 'sinpe'] as const;
export type ApartadoPaymentMethod = typeof APARTADO_PAYMENT_METHODS[number];

export const APARTADO_STATUSES = ['activo', 'completado', 'cancelado'] as const;
export type ApartadoStatus = typeof APARTADO_STATUSES[number];

export const createApartadoSchema = z.object({
  customerName: z.string().min(1).max(200),
  customerPhone: z.string().regex(/^\d{8}$/, 'Debe ser un número de 8 dígitos'),
  description: z.string().min(1).max(500),
  totalAmount: z.number().int().min(1),
  depositAmount: z.number().int().min(0),
  depositMethod: z.enum(APARTADO_PAYMENT_METHODS),
  notes: z.string().max(2000).optional(),
});

export type CreateApartadoInput = z.infer<typeof createApartadoSchema>;

export const addApartadoPaymentSchema = z.object({
  amount: z.number().int().min(1),
  paymentMethod: z.enum(APARTADO_PAYMENT_METHODS),
  note: z.string().max(500).optional(),
});

export type AddApartadoPaymentInput = z.infer<typeof addApartadoPaymentSchema>;

export interface ApartadoPayment {
  id: number;
  apartadoId: number;
  amount: number;
  paymentMethod: ApartadoPaymentMethod;
  note?: string | null;
  createdAt: string;
}

export interface Apartado {
  id: number;
  consecutive: number;
  customerName: string;
  customerPhone: string;
  description: string;
  totalAmount: number;
  paidAmount: number;
  status: ApartadoStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApartadoWithPayments extends Apartado {
  payments: ApartadoPayment[];
}

export interface ApartadoList {
  data: Apartado[];
  total: number;
}
