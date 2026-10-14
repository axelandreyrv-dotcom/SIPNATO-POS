import type { Hono, MiddlewareHandler } from 'hono';
import type { ModuleKey } from '@dosuxsoft/shared';
import type { AppEnv } from '../lib/http.js';
import { getProfile } from '../modules/business/repository.js';

// Registra las rutas de un módulo activable. Si el negocio lo desactivó, todas sus rutas
// responden 404 MODULO_DESACTIVADO: ocultarlo del menú no basta (CLAUDE.md §2.5). Se revisa
// antes que la sesión, como antes.
export function registerModuleRoutes(
  app: Hono<AppEnv>,
  module: ModuleKey,
  routes: Hono<AppEnv>,
  prefix: string,
): void {
  const guard: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (!getProfile().modules.includes(module)) {
      return c.json(
        {
          error: {
            code: 'MODULO_DESACTIVADO',
            message: 'Este módulo está desactivado para el negocio',
          },
        },
        404,
      );
    }
    await next();
  };
  app.use(`${prefix}/*`, guard);
  app.route(prefix, routes);
}
