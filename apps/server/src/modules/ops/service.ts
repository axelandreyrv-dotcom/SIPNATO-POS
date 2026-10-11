import { z } from 'zod';
import { createTenantSchema, slugSchema, superadminUsernameSchema } from '@sipnato/shared';
import { findTenant, listTenants } from '../../db/control.js';
import { RESTORE_ABORT_REASON } from '../../do/tenant-do.js';
import { AppError, NegocioNoActivado, NegocioNoEncontrado } from '../../lib/errors.js';
import type { Meta } from '../platform/repository.js';
import {
  changeTenantStatus,
  createSuperadminAccount,
  createTenant,
  listSuperadminAccounts,
  regenerateSetupCode,
  resetSuperadminPassword,
  setSuperadminEnabled,
  tenantDO,
} from '../platform/service.js';

// Consola de operaciones de emergencia (reemplaza a los scripts que corrían por SSH en el VPS).
// Quien tiene OPS_TOKEN administra toda la plataforma: el token se compara en tiempo constante y
// cada llamada queda en la bitácora de la plataforma (routes.ts).

// ─── Token ────────────────────────────────────────────────────────────────────

// Un token más corto se trata como no configurado: el endpoint no debe quedar abierto por un
// secreto débil puesto por error. Se genera con `openssl rand -hex 32` (64 caracteres).
const MIN_TOKEN_LENGTH = 32;

export function opsEnabled(configured: string | undefined): configured is string {
  return configured !== undefined && configured.length >= MIN_TOKEN_LENGTH;
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

// Se comparan los SHA-256 (siempre 32 bytes) byte a byte sin cortar al primer distinto: el tiempo
// no depende de cuántos caracteres acierte quien prueba ni del largo de lo que mande.
export async function tokenMatches(presented: string, configured: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(presented), sha256(configured)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// ─── Comandos ─────────────────────────────────────────────────────────────────

const usernameArgs = z.object({ username: superadminUsernameSchema }).strict();
const slugArgs = z.object({ slug: slugSchema }).strict();
const noArgs = z.object({}).strict().default({});

// Formato de un bookmark de Durable Objects: grupos hexadecimales separados por guiones.
const bookmarkSchema = z
  .string()
  .max(128, 'Bookmark inválido')
  .regex(/^[0-9a-f]+(?:-[0-9a-f]+)*$/, 'Bookmark inválido');

export const OPS_COMMANDS = [
  'superadmin-create',
  'superadmin-reset',
  'superadmin-disable',
  'superadmin-enable',
  'superadmin-list',
  'tenant-list',
  'tenant-create',
  'tenant-suspend',
  'tenant-activate',
  'setup-code',
  'reset-owner',
  'bookmarks',
  'restore-tenant',
] as const;
export type OpsCommand = (typeof OPS_COMMANDS)[number];

export const opsRequestSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('superadmin-create'), args: usernameArgs }),
  z.object({ command: z.literal('superadmin-reset'), args: usernameArgs }),
  z.object({ command: z.literal('superadmin-disable'), args: usernameArgs }),
  z.object({ command: z.literal('superadmin-enable'), args: usernameArgs }),
  z.object({ command: z.literal('superadmin-list'), args: noArgs }),
  z.object({ command: z.literal('tenant-list'), args: noArgs }),
  z.object({
    command: z.literal('tenant-create'),
    args: z.object({ slug: slugSchema, name: createTenantSchema.shape.name }).strict(),
  }),
  z.object({ command: z.literal('tenant-suspend'), args: slugArgs }),
  z.object({ command: z.literal('tenant-activate'), args: slugArgs }),
  z.object({ command: z.literal('setup-code'), args: slugArgs }),
  z.object({ command: z.literal('reset-owner'), args: slugArgs }),
  z.object({ command: z.literal('bookmarks'), args: slugArgs }),
  z.object({
    command: z.literal('restore-tenant'),
    args: z.object({ slug: slugSchema, bookmark: bookmarkSchema }).strict(),
  }),
]);
export type OpsRequest = z.infer<typeof opsRequestSchema>;

// `OPS_SUPERADMIN_CREATE`, `OPS_RESTORE_TENANT`…
export const auditActionFor = (command: OpsCommand) =>
  `OPS_${command.toUpperCase().replaceAll('-', '_')}`;

export interface OpsOutcome {
  // Lo que recibe la consola (puede llevar contraseñas temporales y códigos).
  result: object;
  // Lo que se agrega a la bitácora además de los argumentos. Nunca secretos.
  audit?: Record<string, unknown>;
}

function requireTenant(slug: string): void {
  if (!findTenant(slug)) throw new NegocioNoEncontrado();
}

// Un DO que nunca se inicializó no tiene esquema ni bookmarks propios que valga la pena leer.
async function requireInitialized(slug: string) {
  requireTenant(slug);
  const summary = await tenantDO(slug).platformSummary();
  if (!summary) throw new NegocioNoEncontrado();
  return summary;
}

async function restoreTenant(slug: string, bookmark: string): Promise<OpsOutcome> {
  await requireInitialized(slug);
  // El bookmark de ahora, para deshacer la restauración con otro restore-tenant si hace falta.
  const { current: undoBookmark } = await tenantDO(slug).bookmarks();
  let failure: { reason: string };
  try {
    failure = await tenantDO(slug).restoreToBookmark(bookmark);
  } catch (err) {
    // Si funcionó, el DO se reinicia sin responder: su error trae el motivo del reinicio.
    if (err instanceof Error && err.message.includes(RESTORE_ABORT_REASON)) {
      return { result: { restored: true, undoBookmark }, audit: { undoBookmark } };
    }
    // Cualquier otro error (el DO no respondió, la red) no dice si la restauración quedó
    // programada: si quedó, ocurre en el próximo reinicio del DO.
    console.error('restauración con resultado incierto', slug, err);
    throw new AppError(
      'RESTAURACION_INCIERTA',
      'No se sabe si la restauración quedó programada; revisa el negocio antes de reintentar',
      502,
    );
  }
  console.warn('restauración no programada', slug, failure.reason);
  throw new AppError(
    'RESTAURACION_NO_PROGRAMADA',
    'No se pudo programar la restauración: el bookmark no es válido o tiene más de 30 días',
    422,
  );
}

export async function runOpsCommand(request: OpsRequest, meta: Meta): Promise<OpsOutcome> {
  switch (request.command) {
    case 'superadmin-create':
      return { result: { tempPassword: await createSuperadminAccount(request.args.username) } };
    case 'superadmin-reset':
      return { result: { tempPassword: await resetSuperadminPassword(request.args.username) } };
    case 'superadmin-disable':
    case 'superadmin-enable': {
      const enabled = request.command === 'superadmin-enable';
      setSuperadminEnabled(request.args.username, enabled);
      return { result: { username: request.args.username, active: enabled } };
    }
    case 'superadmin-list':
      return { result: { superadmins: listSuperadminAccounts() } };

    // Solo control.db: sirve aunque el DO de algún negocio no responda.
    case 'tenant-list':
      return { result: { tenants: listTenants() } };
    case 'tenant-create': {
      // Como el alta por consola de antes: tipo "Otro tipo de negocio", se cambia en el panel.
      const input = createTenantSchema.parse({ ...request.args, paidUntil: null });
      const { setupCode } = await createTenant(null, input, meta);
      return { result: { slug: input.slug, setupCode } };
    }
    case 'tenant-suspend':
    case 'tenant-activate': {
      const status = request.command === 'tenant-suspend' ? 'suspended' : 'active';
      await changeTenantStatus(null, request.args.slug, status, meta);
      return { result: { slug: request.args.slug, status } };
    }
    case 'setup-code':
      return {
        result: { setupCode: await regenerateSetupCode(null, request.args.slug, meta) },
      };

    case 'reset-owner': {
      const summary = await requireInitialized(request.args.slug);
      if (!summary.activated) throw new NegocioNoActivado();
      const reset = await tenantDO(request.args.slug).resetOwner();
      return { result: reset, audit: { username: reset.username } };
    }
    case 'bookmarks': {
      await requireInitialized(request.args.slug);
      return { result: await tenantDO(request.args.slug).bookmarks() };
    }
    case 'restore-tenant':
      return restoreTenant(request.args.slug, request.args.bookmark);
  }
}
