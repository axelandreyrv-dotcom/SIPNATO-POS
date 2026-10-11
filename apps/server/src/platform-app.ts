import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { currentPlatformStorage } from './db/control.js';
import { apiHeaders, errorHandler, type AppEnv } from './lib/http.js';
import { rateLimit } from './lib/rate-limit.js';
import opsRoutes from './modules/ops/routes.js';
import platformRoutes from './modules/platform/routes.js';

// API del panel (admin.<dominio>) y la consola de operaciones (/internal/ops). Corre dentro del Durable Object de la plataforma: no expone
// ninguna ruta de negocio y nunca entra al contexto de un negocio.
export function createPlatformApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use(apiHeaders);
  app.use(async (c, next) => {
    const storage = currentPlatformStorage();
    c.set('kv', storage.kv);
    c.set('storage', storage);
    await next();
  });
  app.use(rateLimit('global', 200, 60_000));
  app.use(
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (c) =>
        c.json(
          {
            error: { code: 'CUERPO_DEMASIADO_GRANDE', message: 'La solicitud es demasiado grande' },
          },
          413,
        ),
    }),
  );

  app.get('/health', (c) =>
    c.json({ status: 'ok', environment: c.env.ENVIRONMENT, time: new Date().toISOString() }),
  );
  app.route('/platform', platformRoutes);
  app.route('/internal/ops', opsRoutes);

  app.notFound((c) =>
    c.json({ error: { code: 'NO_ENCONTRADO', message: 'Ruta no encontrada' } }, 404),
  );
  app.onError(errorHandler);
  return app;
}
