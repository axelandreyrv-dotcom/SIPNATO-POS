import { z } from 'zod';

export const customerPhoneSchema = z
  .string()
  .regex(/^\d{8}$/, 'El celular debe tener exactamente 8 dígitos');

export const customerIdNumberSchema = z
  .string()
  .regex(/^[a-zA-Z0-9\-]{1,20}$/, 'Cédula inválida')
  .optional();

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(200),
  phone: customerPhoneSchema,
  email: z.string().email('Correo inválido').max(200).optional(),
  address: z.string().max(500).optional(),
  idNumber: customerIdNumberSchema,
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export type Customer = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  idNumber: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerList = {
  customers: Customer[];
  total: number;
  page: number;
  totalPages: number;
};
