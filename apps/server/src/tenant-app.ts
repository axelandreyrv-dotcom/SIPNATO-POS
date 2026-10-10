import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { apiHeaders, errorHandler, type AppEnv } from './lib/http.js';
import { rateLimit } from './lib/rate-limit.js';
import { registerModuleRoutes } from './middleware/module.js';
import apartadosRoutes from './modules/apartados/routes.js';
import authRoutes from './modules/auth/routes.js';
import boletasRoutes from './modules/boletas/routes.js';
import businessRoutes from './modules/business/routes.js';
import cashRegisterRoutes from './modules/cash-registers/routes.js';
import creditosRoutes from './modules/creditos/routes.js';
import customersRoutes from './modules/customers/routes.js';
import dashboardRoutes from './modules/dashboard/routes.js';
import expensesRoutes from './modules/expenses/routes.js';
import facturasRoutes from './modules/facturas/routes.js';
import notesRoutes from './modules/notes/routes.js';
import notificationsRoutes, { exchangeRateRoutes } from './modules/notifications/routes.js';
import productsRoutes from './modules/products/routes.js';
import quotesRoutes from './modules/quotes/routes.js';
import reportsRoutes from './modules/reports/routes.js';
import salesRoutes from './modules/sales/routes.js';
import settingsRoutes from './modules/settings/routes.js';
import usersRoutes from './modules/users/routes.js';

// API de un negocio. Corre dentro de su Durable Object, con el contexto del negocio ya fijado;
// `storage` es el de ese DO: su kv lleva los contadores del rate limit y el respaldo vuelca
// sus tablas.
export function createTenantApp(storage: DurableObjectStorage): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use(apiHeaders);
  app.use(async (c, next) => {
    c.set('kv', storage.kv);
    c.set('storage', storage);
    await next();
  });
  app.use(rateLimit('global', 200, 60_000));
  // El mismo tope de 1 MB que traía Fastify: ningún cuerpo legítimo se le acerca.
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

  app.route('/auth', authRoutes);
  app.route('/api/cash-registers', cashRegisterRoutes);
  app.route('/api/customers', customersRoutes);
  app.route('/api/expenses', expensesRoutes);
  app.route('/api/sales', salesRoutes);
  app.route('/api/notes', notesRoutes);
  app.route('/api/settings', settingsRoutes);
  app.route('/api/reports', reportsRoutes);
  app.route('/api/dashboard', dashboardRoutes);
  app.route('/api/users', usersRoutes);
  app.route('/api/business', businessRoutes);
  app.route('/api/exchange-rate', exchangeRateRoutes);
  app.route('/api/notifications', notificationsRoutes);

  // Módulos que cada negocio activa o desactiva (perfil del negocio).
  registerModuleRoutes(app, 'ordenes', boletasRoutes, '/api/boletas');
  registerModuleRoutes(app, 'cotizaciones', quotesRoutes, '/api/quotes');
  registerModuleRoutes(app, 'facturas', facturasRoutes, '/api/facturas');
  registerModuleRoutes(app, 'apartados', apartadosRoutes, '/api/apartados');
  registerModuleRoutes(app, 'creditos', creditosRoutes, '/api/creditos');
  registerModuleRoutes(app, 'inventario', productsRoutes, '/api/products');

  app.notFound((c) =>
    c.json({ error: { code: 'NO_ENCONTRADO', message: 'Ruta no encontrada' } }, 404),
  );
  app.onError(errorHandler);
  return app;
}
