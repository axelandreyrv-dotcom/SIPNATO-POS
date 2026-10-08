import { z } from 'zod';

// Avisos a clientes por WhatsApp: el sistema arma el mensaje y abre WhatsApp con él;
// quien atiende toca Enviar desde el WhatsApp del negocio. No hay envío automático.

export const NOTIFICATION_EVENTS = [
  'orden_recibida',
  'orden_lista',
  'cobro_credito',
  'abono',
  'cotizacion',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

// Clave en settings de cada plantilla.
export const MESSAGE_SETTING_KEYS = {
  orden_recibida: 'msg_orden_recibida',
  orden_lista: 'msg_orden_lista',
  cobro_credito: 'msg_cobro_credito',
  abono: 'msg_abono',
  cotizacion: 'msg_cotizacion',
} as const satisfies Record<NotificationEvent, string>;

export const NOTIFICATION_LABELS: Record<NotificationEvent, string> = {
  orden_recibida: 'Orden recibida',
  orden_lista: 'Listo para retirar',
  cobro_credito: 'Recordatorio de cobro',
  abono: 'Abono registrado',
  cotizacion: 'Cotización',
};

export const DEFAULT_MESSAGES: Record<NotificationEvent, string> = {
  orden_recibida:
    'Hola {cliente}, recibimos su {articulo} en {negocio}. Su número de orden es #{numero}. Le avisaremos cuando esté listo.',
  orden_lista:
    'Hola {cliente}, su {articulo} (orden #{numero}) ya está listo para retirar en {negocio}. ¡Gracias por su preferencia!',
  cobro_credito:
    'Hola {cliente}, le recordamos que tiene un saldo pendiente de {saldo} con {negocio} (crédito #{numero}), con vencimiento el {vencimiento}. ¡Gracias!',
  abono:
    'Hola {cliente}, registramos su abono de {abono} en {negocio}. Saldo pendiente: {saldo}. ¡Gracias!',
  cotizacion:
    'Hola, le compartimos la cotización #{numero} de {negocio}:\n{detalle}\nTotal: {total}',
};

// Variables disponibles por aviso (se muestran como ayuda al editar la plantilla).
export const MESSAGE_VARIABLES: Record<NotificationEvent, string[]> = {
  orden_recibida: ['cliente', 'articulo', 'numero', 'negocio'],
  orden_lista: ['cliente', 'articulo', 'numero', 'negocio'],
  cobro_credito: ['cliente', 'saldo', 'numero', 'vencimiento', 'negocio'],
  abono: ['cliente', 'abono', 'saldo', 'negocio'],
  cotizacion: ['numero', 'detalle', 'total', 'negocio'],
};

// Sustituye {variable}. Las variables desconocidas quedan tal cual, para que un error
// de tipeo en la plantilla se vea en el mensaje en vez de desaparecer.
export function renderMessage(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

// Celular de Costa Rica (8 dígitos) → enlace que abre el chat con el mensaje escrito.
// Sin teléfono, WhatsApp pide elegir el contacto.
export function whatsappLink(phone: string | null | undefined, message: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  const target = /^\d{8}$/.test(digits) ? `506${digits}` : /^506\d{8}$/.test(digits) ? digits : '';
  return `https://wa.me/${target}?text=${encodeURIComponent(message)}`;
}

export const recordNotificationSchema = z.object({
  event: z.enum(NOTIFICATION_EVENTS),
  entityType: z.enum(['boleta', 'credito', 'apartado', 'quote']),
  entityId: z.number().int().positive(),
  phone: z.string().max(20).nullable(),
});

export type RecordNotificationInput = z.infer<typeof recordNotificationSchema>;

export interface CustomerNotification {
  event: NotificationEvent;
  createdAt: string;
  username: string | null;
}
