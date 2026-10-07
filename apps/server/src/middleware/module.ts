import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ModuleKey } from '@sipnato/shared';
import { getProfile } from '../modules/business/repository.js';

// Registra las rutas de un módulo activable. Si el negocio lo desactivó, todas sus rutas
// responden 404 MODULO_DESACTIVADO: ocultarlo del menú no basta (CLAUDE.md §2.5).
export async function registerModuleRoutes(
  app: FastifyInstance,
  module: ModuleKey,
  routes: FastifyPluginAsync,
  prefix: string,
): Promise<void> {
  await app.register(async (scope) => {
    scope.addHook('preHandler', async (_request, reply) => {
      if (!getProfile().modules.includes(module)) {
        return reply.status(404).send({ error: { code: 'MODULO_DESACTIVADO', message: 'Este módulo está desactivado para el negocio' } });
      }
    });
    await scope.register(routes);
  }, { prefix });
}
