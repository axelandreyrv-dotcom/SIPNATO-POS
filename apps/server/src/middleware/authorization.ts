import type { FastifyRequest } from 'fastify';
import { can, supervisorAuthSchema, type Permission } from '@sipnato/shared';
import type { Actor } from '../db/client.js';
import { AutorizacionRequerida } from '../lib/errors.js';
import { verifySupervisor } from '../modules/users/service.js';

// Acciones que un rol sin el permiso puede hacer si un admin/dueño las autoriza en el momento,
// enviando sus credenciales en `body.authorization`. Devuelve quién autorizó (el propio usuario
// si tiene el permiso), para dejarlo en el audit_log.
export async function authorizeOrEscalate(request: FastifyRequest, permission: Permission): Promise<Actor> {
  if (can(request.user.role, permission)) return request.user;

  const body = request.body as { authorization?: unknown } | undefined;
  const parsed = supervisorAuthSchema.safeParse(body?.authorization);
  if (!parsed.success) throw new AutorizacionRequerida();

  const supervisor = await verifySupervisor(parsed.data);
  if (!can(supervisor.role, permission)) throw new AutorizacionRequerida();
  return supervisor;
}
