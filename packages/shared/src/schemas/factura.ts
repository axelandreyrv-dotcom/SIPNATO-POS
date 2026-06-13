import { z } from 'zod';

export const createFacturaItemSchema = z.object({
  quantity: z.number().int().min(1, 'Cantidad mínima: 1'),
  description: z.string().min(1, 'Descripción requerida').max(300),
  unitPrice: z.number().int().min(0, 'Precio debe ser ≥ 0'),
});

export const createFacturaSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
    .refine((v) => !isNaN(new Date(v).getTime()), 'Fecha inválida'),
  clientName: z.string().min(1, 'Cliente requerido').max(200),
  clientCedula: z.string().max(20).optional(),
  ivaPercent: z.number().int().min(0).max(100).default(0),
  items: z
    .array(createFacturaItemSchema)
    .min(1, 'Debe tener al menos un ítem'),
});

export type CreateFacturaInput = z.infer<typeof createFacturaSchema>;

export type FacturaItem = {
  id: number;
  facturaId: number;
  quantity: number;
  description: string;
  unitPrice: number;
  total: number;
  sortOrder: number;
};

export type Factura = {
  id: number;
  consecutive: number;
  date: string;
  clientName: string;
  clientCedula: string | null;
  ivaPercent: number;
  subtotal: number;
  ivaAmount: number;
  total: number;
  status: 'activa' | 'anulada';
  createdAt: string;
  updatedAt: string;
};

export type FacturaWithItems = Factura & { items: FacturaItem[] };

export type FacturaList = {
  data: Factura[];
  total: number;
  page: number;
  pageSize: number;
};
