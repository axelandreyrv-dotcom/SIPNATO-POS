import { z } from 'zod';
import { customerIdNumberSchema, customerPhoneSchema } from './customer.js';
import type { OrderFieldValue } from './business.js';

// Orden de servicio ("boleta" en celulares). Los campos variables (`fields`) dependen
// del perfil del negocio y los valida el servidor contra él (validateOrderFields).
export const createBoletaSchema = z.object({
  customerName: z.string().min(1, 'El nombre es requerido').max(200),
  customerPhone: customerPhoneSchema,
  customerEmail: z.string().email('Correo inválido').max(200).optional(),
  customerIdNumber: customerIdNumberSchema,
  deviceModel: z.string().trim().min(1, 'Este dato es requerido').max(200),
  fields: z.record(z.string(), z.string().max(500)).default({}),
  description: z.string().min(1, 'La descripción es requerida').max(5000),
});

export type CreateBoletaInput = z.infer<typeof createBoletaSchema>;

export type Boleta = {
  id: number;
  customerId: number;
  consecutive: number;
  // Artículo recibido: modelo del equipo, vehículo... (etiqueta según el perfil).
  deviceModel: string;
  fields: OrderFieldValue[];
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
  fields: OrderFieldValue[];
  description: string;
  createdAt: string;
};
