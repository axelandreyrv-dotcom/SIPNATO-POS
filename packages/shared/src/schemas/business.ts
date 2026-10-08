import { z } from 'zod';

// ─── Módulos activables ───────────────────────────────────────────────────────
// Dashboard, POS, Caja, Clientes, Gastos, Notas, Reportes, Usuarios y Configuración
// están siempre activos. Estos los propone la plantilla y el dueño los ajusta.
export const TOGGLEABLE_MODULES = [
  'ordenes',
  'cotizaciones',
  'facturas',
  'apartados',
  'creditos',
  'inventario',
] as const;
export type ModuleKey = (typeof TOGGLEABLE_MODULES)[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  ordenes: 'Órdenes de servicio',
  cotizaciones: 'Cotizaciones',
  facturas: 'Facturas',
  apartados: 'Apartados',
  creditos: 'Créditos',
  inventario: 'Inventario',
};

// ─── Campos de la orden de servicio ───────────────────────────────────────────
// secret: dato que el cliente entrega (contraseña o patrón del equipo). Se guarda
// en texto plano, como siempre lo hizo la boleta; la UI lo advierte.
export const ORDER_FIELD_TYPES = ['text', 'number', 'select', 'imei', 'secret'] as const;
export type OrderFieldType = (typeof ORDER_FIELD_TYPES)[number];

export const ORDER_FIELD_TYPE_LABELS: Record<OrderFieldType, string> = {
  text: 'Texto',
  number: 'Número',
  select: 'Lista de opciones',
  imei: 'IMEI (15 dígitos)',
  secret: 'Contraseña del cliente',
};

export const orderFieldSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]{1,40}$/, 'Clave de campo inválida'),
    label: z.string().trim().min(1, 'Cada campo necesita un nombre').max(60),
    type: z.enum(ORDER_FIELD_TYPES),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  })
  .refine((f) => f.type !== 'select' || (f.options?.length ?? 0) >= 2, {
    message: 'Una lista de opciones necesita al menos 2 opciones',
    path: ['options'],
  });

export type OrderField = z.infer<typeof orderFieldSchema>;

// Valor guardado en la orden, con el nombre que tenía el campo al crearla: si el dueño
// renombra o borra el campo después, las órdenes viejas se siguen leyendo igual.
export interface OrderFieldValue {
  key: string;
  label: string;
  value: string;
}

// ─── Perfil del negocio ───────────────────────────────────────────────────────

export const BUSINESS_TEMPLATES = [
  'celulares',
  'electronica',
  'taller',
  'tienda',
  'generico',
] as const;
export type BusinessTemplate = (typeof BUSINESS_TEMPLATES)[number];

export const businessProfileSchema = z
  .object({
    template: z.enum(BUSINESS_TEMPLATES),
    ordersLabel: z.string().trim().min(1, 'Indica cómo se llaman las órdenes').max(40),
    itemLabel: z.string().trim().min(1, 'Indica qué se recibe (equipo, vehículo…)').max(40),
    fields: z.array(orderFieldSchema).max(15, 'Máximo 15 campos'),
    modules: z.array(z.enum(TOGGLEABLE_MODULES)),
  })
  .refine((p) => new Set(p.fields.map((f) => f.key)).size === p.fields.length, {
    message: 'Hay campos repetidos',
    path: ['fields'],
  });

export type BusinessProfile = z.infer<typeof businessProfileSchema>;

const ALL_BUT = (...off: ModuleKey[]) => TOGGLEABLE_MODULES.filter((m) => !off.includes(m));

export const TEMPLATE_INFO: Record<
  BusinessTemplate,
  { name: string; description: string; profile: Omit<BusinessProfile, 'template'> }
> = {
  celulares: {
    name: 'Reparación de celulares',
    description: 'Boletas con modelo, IMEI y contraseña del equipo.',
    profile: {
      ordersLabel: 'Boletas',
      itemLabel: 'Modelo del equipo',
      fields: [
        { key: 'imei', label: 'IMEI', type: 'imei', required: false },
        { key: 'clave', label: 'Contraseña o patrón', type: 'secret', required: false },
      ],
      // Apartados quedó fuera del menú por decisión del negocio original (2026-06-17).
      modules: ALL_BUT('apartados'),
    },
  },
  electronica: {
    name: 'Electrónica y computadoras',
    description: 'Órdenes con equipo, marca, número de serie y accesorios recibidos.',
    profile: {
      ordersLabel: 'Órdenes de servicio',
      itemLabel: 'Equipo',
      fields: [
        { key: 'marca', label: 'Marca', type: 'text', required: false },
        { key: 'serie', label: 'Número de serie', type: 'text', required: false },
        { key: 'accesorios', label: 'Accesorios recibidos', type: 'text', required: false },
        { key: 'clave', label: 'Contraseña', type: 'secret', required: false },
      ],
      modules: ALL_BUT('apartados'),
    },
  },
  taller: {
    name: 'Taller mecánico / motos',
    description: 'Órdenes de trabajo con placa, año y kilometraje.',
    profile: {
      ordersLabel: 'Órdenes de trabajo',
      itemLabel: 'Vehículo (marca y modelo)',
      fields: [
        { key: 'placa', label: 'Placa', type: 'text', required: true },
        { key: 'anio', label: 'Año', type: 'number', required: false },
        { key: 'kilometraje', label: 'Kilometraje', type: 'number', required: false },
        { key: 'color', label: 'Color', type: 'text', required: false },
      ],
      modules: ALL_BUT('apartados'),
    },
  },
  tienda: {
    name: 'Tienda sin servicio técnico',
    description: 'Ropa, ferretería, bazar: punto de venta, inventario, apartados y créditos.',
    profile: {
      ordersLabel: 'Órdenes de servicio',
      itemLabel: 'Artículo',
      fields: [],
      modules: ALL_BUT('ordenes'),
    },
  },
  generico: {
    name: 'Otro tipo de negocio',
    description: 'Órdenes con un artículo y descripción; personalízalas a tu medida.',
    profile: {
      ordersLabel: 'Órdenes de servicio',
      itemLabel: 'Artículo',
      fields: [],
      modules: ALL_BUT('apartados'),
    },
  },
};

export function profileFromTemplate(template: BusinessTemplate): BusinessProfile {
  const { profile } = TEMPLATE_INFO[template];
  return {
    template,
    ...profile,
    fields: profile.fields.map((f) => ({ ...f })),
    modules: [...profile.modules],
  };
}

// Clave estable a partir del nombre visible: "Número de serie" → "numero_de_serie".
export function fieldKeyFromLabel(label: string, taken: string[]): string {
  const base =
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'campo';
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}_${i}`;
  return key;
}

// ─── Validación de valores contra el perfil ───────────────────────────────────

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

// Devuelve los valores listos para guardar, o el primer error por campo.
// Las claves que no están en el perfil se ignoran; los vacíos no se guardan.
export function validateOrderFields(
  fields: OrderField[],
  input: Record<string, string>,
): { ok: true; values: OrderFieldValue[] } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const values: OrderFieldValue[] = [];

  for (const f of fields) {
    const raw = (input[f.key] ?? '').trim();
    if (!raw) {
      if (f.required) errors[f.key] = `${f.label}: dato obligatorio`;
      continue;
    }
    if (raw.length > 500) errors[f.key] = `${f.label}: máximo 500 caracteres`;
    else if (f.type === 'number' && !/^-?\d+([.,]\d+)?$/.test(raw))
      errors[f.key] = `${f.label} debe ser un número`;
    else if (f.type === 'imei' && !/^\d{15}$/.test(raw))
      errors[f.key] = `${f.label} debe tener 15 dígitos`;
    else if (f.type === 'imei' && !validateImei(raw))
      errors[f.key] = `${f.label} inválido (revisa los dígitos)`;
    else if (f.type === 'select' && !f.options?.includes(raw))
      errors[f.key] = `${f.label}: elige una opción de la lista`;
    else values.push({ key: f.key, label: f.label, value: raw });
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values };
}
