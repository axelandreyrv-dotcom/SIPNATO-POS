import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { currentPlatformStorage } from './db/control.js';
import { apiHeaders, errorHandler, sameOriginWrites, type AppEnv } from './lib/http.js';
import { rateLimit } from './lib/rate-limit.js';
import opsRoutes from './modules/ops/routes.js';
import platformRoutes from './modules/platform/routes.js';

// Centro de datos donde corre este Durable Object (no cambia durante su vida): la latencia de toda la API depende de él.
let colo: Promise<string | null> | null = null;
function platformColo(environment: string): Promise<string | null> {
  if (environment !== 'production') return Promise.resolve(null);
  colo ??= fetch('https://www.cloudflare.com/cdn-cgi/trace')
    .then((res) => res.text())
    .then(
      (text) =>
        text
          .split('\n')
          .find((l) => l.startsWith('colo='))
          ?.slice(5) ?? null,
    )
    .catch(() => {
      colo = null;
      return null;
    });
  return colo;
}

// API del panel (admin.<dominio>) y la consola de operaciones (/internal/ops). Corre dentro del Durable Object de la plataforma: no expone
// ninguna ruta de negocio y nunca entra al contexto de un negocio.
export function createPlatformApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use(apiHeaders);
  app.use(sameOriginWrites);
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

  app.get('/health', async (c) =>
    c.json({
      status: 'ok',
      environment: c.env.ENVIRONMENT,
      time: new Date().toISOString(),
      colo: await platformColo(c.env.ENVIRONMENT),
    }),
  );
  app.route('/platform', platformRoutes);
  app.route('/internal/ops', opsRoutes);

  app.notFound((c) =>
    c.json({ error: { code: 'NO_ENCONTRADO', message: 'Ruta no encontrada' } }, 404),
  );
  app.onError(errorHandler);
  return app;
}
