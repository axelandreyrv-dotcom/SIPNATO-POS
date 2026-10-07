import type { FastifyBaseLogger } from 'fastify';
import { runWithTenant } from '../db/client.js';
import { listActiveTenants } from '../db/control.js';

// Ejecuta `fn` una vez por negocio activo, dentro de su contexto de BD.
// El fallo de un negocio se loguea y no impide procesar a los demás.
export async function forEachActiveTenant(
  log: FastifyBaseLogger,
  job: string,
  fn: (slug: string, log: FastifyBaseLogger) => void | Promise<void>,
): Promise<void> {
  for (const { slug } of listActiveTenants()) {
    const tenantLog = log.child({ tenant: slug, job });
    try {
      await runWithTenant(slug, () => fn(slug, tenantLog));
    } catch (err) {
      tenantLog.error({ err }, `${job}: error en negocio`);
    }
  }
}
