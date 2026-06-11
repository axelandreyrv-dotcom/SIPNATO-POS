import { z } from 'zod';
import { customerIdNumberSchema, customerPhoneSchema } from './customer.js';

export function validateImei(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = imei.length - 1; i >= 0; i--) {
    let digit = parseInt(imei[i]!);
    const posFromRight = imei.length - i;
    if (posFromRight % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export const createBoletaSchema = z.object({
  customerName: z.string().min(1, 'El nombre es requerido').max(200),
  customerPhone: customerPhoneSchema,
  customerEmail: z.string().email('Correo inválido').max(200).optional(),
  customerIdNumber: customerIdNumberSchema,
  deviceModel: z.string().min(1, 'El modelo es requerido').max(200),
  imei: z
    .string()
    .regex(/^\d{15}$/, 'El IMEI debe tener 15 dígitos')
    .refine(validateImei, 'IMEI inválido (falla Luhn)')
    .optional(),
  unlockPassword: z.string().max(100).optional(),
  description: z.string().min(1, 'La descripción es requerida').max(5000),
});

export type CreateBoletaInput = z.infer<typeof createBoletaSchema>;

export type Boleta = {
  id: number;
  customerId: number;
  consecutive: number;
  deviceModel: string;
  imei: string | null;
  unlockPassword: string | null;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type BoletaWithCustomer = Boleta & {
  customerName: string;
  customerPhone: string;
};

export type BoletaList = {
  boletas: BoletaWithCustomer[];
  total: number;
  page: number;
  totalPages: number;
};

export type BoletaSummary = {
  id: number;
  consecutive: number;
  deviceModel: string;
  imei: string | null;
  description: string;
  createdAt: string;
};
