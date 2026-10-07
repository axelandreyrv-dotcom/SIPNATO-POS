import { z } from 'zod';

export const customerPhoneSchema = z
  .string()
  .regex(/^\d{8}$/, 'El celular debe tener exactamente 8 dígitos');

export const customerIdNumberSchema = z
  .string()
  .regex(/^[a-zA-Z0-9\-]{1,20}$/, 'Cédula inválida')
  .optional();

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
