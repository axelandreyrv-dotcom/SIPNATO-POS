import { z } from 'zod';

export const settingsSchema = z.object({
  shop_name: z.string().max(100),
  shop_address: z.string().max(200),
  shop_phone: z.string().max(20),
  shop_mobile: z.string().max(20),
  shop_id_number: z.string().max(20),
  receipt_footer: z.string().max(500),
  boleta_footer: z.string().max(500),
  quote_footer: z.string().max(500),
  auto_close_enabled: z.boolean(),
  auto_close_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:MM requerido (00:00–23:59)'),
});

export type Settings = z.infer<typeof settingsSchema>;
