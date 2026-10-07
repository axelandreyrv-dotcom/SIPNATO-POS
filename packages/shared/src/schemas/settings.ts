import { z } from 'zod';

const message = z.string().max(1000);

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
  // Tipo de cambio de respaldo (₡ por dólar, p. ej. "505.50") cuando no hay dato del BCCR.
  usd_manual_rate: z
    .string()
    .trim()
    .regex(/^(\d{2,4}([.,]\d{1,2})?)?$/, 'Tipo de cambio inválido (ej. 505.50)'),
  // Plantillas de avisos por WhatsApp. Vacío = usar el texto por defecto.
  msg_orden_recibida: message,
  msg_orden_lista: message,
  msg_cobro_credito: message,
  msg_abono: message,
  msg_cotizacion: message,
});

export type Settings = z.infer<typeof settingsSchema>;
