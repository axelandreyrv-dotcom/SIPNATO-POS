import { z } from 'zod';

// ─── Campos comunes ───────────────────────────────────────────────────────────

export const USER_ROLES = ['dueno', 'admin', 'cajero'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  dueno: 'Dueño',
  admin: 'Administrador',
  cajero: 'Cajero',
};

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9._-]{3,32}$/,
    'Usuario: 3 a 32 caracteres (letras minúsculas, números, punto, guion)',
  );

export const displayNameSchema = z.string().trim().min(1, 'El nombre es requerido').max(60);

export const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(128);

// Los cajeros entran con PIN (más rápido en el mostrador); dueño y admins con contraseña.
export const pinSchema = z.string().regex(/^\d{6}$/, 'El PIN debe tener exactamente 6 dígitos');

export function secretSchemaFor(role: UserRole) {
  return role === 'cajero' ? pinSchema : passwordSchema;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const setupSchema = z
  .object({
    setupCode: z.string().trim().min(1, 'Ingresa el código de activación').max(64),
    // El tipo de negocio y los módulos ya vienen asignados desde el panel de la plataforma.
    username: usernameSchema,
    displayName: displayNameSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

// `password` es la contraseña o el PIN según el rol del usuario.
export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Ingresa tu usuario').max(32),
  password: z.string().min(1, 'Ingresa tu contraseña o PIN').max(128),
});

export const recoverSchema = z.object({
  recoveryCode: z.string().min(1),
  newPassword: passwordSchema,
});

// Autorización en el momento de un admin o dueño (p. ej. cuando un cajero elimina una venta).
export const supervisorAuthSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(32),
  secret: z.string().min(1).max(128),
});

export type SetupInput = z.infer<typeof setupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RecoverInput = z.infer<typeof recoverSchema>;
export type SupervisorAuth = z.infer<typeof supervisorAuthSchema>;

export interface CurrentUser {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
}

// ─── Gestión de usuarios ──────────────────────────────────────────────────────

// El dueño solo se crea en /setup. El secreto se valida contra el rol en superRefine.
export const createUserSchema = z
  .object({
    username: usernameSchema,
    displayName: displayNameSchema,
    role: z.enum(['admin', 'cajero']),
    secret: z.string(),
  })
  .superRefine((d, ctx) => {
    const result = secretSchemaFor(d.role).safeParse(d.secret);
    if (!result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['secret'],
        message: result.error.issues[0]!.message,
      });
    }
  });

// El rol no se cambia: el tipo de secreto (contraseña/PIN) depende de él. Se desactiva y se crea otro.
export const updateUserSchema = z.object({
  displayName: displayNameSchema.optional(),
  active: z.boolean().optional(),
  secret: z.string().max(128).optional(),
  // Quita el bloqueo por intentos fallidos sin cambiar la contraseña/PIN.
  unlock: z.literal(true).optional(),
});

export const changeOwnSecretSchema = z.object({
  currentSecret: z.string().min(1).max(128),
  newSecret: z.string().max(128),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangeOwnSecretInput = z.infer<typeof changeOwnSecretSchema>;

export interface UserRecord {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  locked: boolean;
  createdAt: string;
}

// ─── Permisos ─────────────────────────────────────────────────────────────────
// Espejo de las reglas del servidor, solo para mostrar u ocultar controles en la UI.
// El servidor es quien las hace cumplir.

export const PERMISSIONS = {
  // Eliminar ventas/gastos sin pedir autorización a otro usuario
  deleteMoneyDirectly: ['dueno', 'admin'],
  // Cancelar créditos/apartados, anular facturas
  cancelDocuments: ['dueno', 'admin'],
  manageUsers: ['dueno', 'admin'],
  // Crear/editar productos, cambiar precios, registrar entradas y ajustes de stock
  manageInventory: ['dueno', 'admin'],
  // Ver costos y márgenes
  viewCosts: ['dueno', 'admin'],
  manageSettings: ['dueno'],
  downloadBackup: ['dueno'],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}

// Qué roles puede crear/modificar cada rol.
export function manageableRoles(role: UserRole): UserRole[] {
  if (role === 'dueno') return ['admin', 'cajero'];
  if (role === 'admin') return ['cajero'];
  return [];
}
