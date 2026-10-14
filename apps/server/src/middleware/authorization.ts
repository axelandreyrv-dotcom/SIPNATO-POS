import { can, supervisorAuthSchema, type Permission } from '@dosuxsoft/shared';
import type { Actor } from '../db/client.js';
import { AutorizacionRequerida } from '../lib/errors.js';
import { readJson, type AppContext } from '../lib/http.js';
import { verifySupervisor } from '../modules/users/service.js';

// Acciones que un rol sin el permiso puede hacer si un admin/dueño las autoriza en el momento,
// enviando sus credenciales en `body.authorization`. Devuelve quién autorizó (el propio usuario
// si tiene el permiso), para dejarlo en el audit_log.
export async function authorizeOrEscalate(c: AppContext, permission: Permission): Promise<Actor> {
  const user = c.var.user;
  if (can(user.role, permission)) return user;

  const body = (await readJson(c)) as { authorization?: unknown } | undefined;
  const parsed = supervisorAuthSchema.safeParse(body?.authorization);
  if (!parsed.success) throw new AutorizacionRequerida();

  const supervisor = await verifySupervisor(parsed.data);
  if (!can(supervisor.role, permission)) throw new AutorizacionRequerida();
  return supervisor;
}
