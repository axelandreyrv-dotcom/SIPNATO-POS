import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { config } from './config.js';
import { findTenant, pingControlDb } from './db/control.js';
import { AppError } from './lib/errors.js';
import { startAutoCloseCron } from './jobs/auto-close.js';
import { startBackupCron } from './jobs/backup.js';
import { startCleanupJobs } from './jobs/cleanup-sessions.js';
import { registerSecurityHeaders } from './middleware/security-headers.js';
import { registerTenantResolution, slugFromHostname } from './middleware/tenant.js';
import authRoutes from './modules/auth/routes.js';
import cashRegisterRoutes from './modules/cash-registers/routes.js';
import boletasRoutes from './modules/boletas/routes.js';
import customersRoutes from './modules/customers/routes.js';
import expensesRoutes from './modules/expenses/routes.js';
import salesRoutes from './modules/sales/routes.js';
import notesRoutes from './modules/notes/routes.js';
import quotesRoutes from './modules/quotes/routes.js';
import settingsRoutes from './modules/settings/routes.js';
import reportsRoutes from './modules/reports/routes.js';
import dashboardRoutes from './modules/dashboard/routes.js';
import apartadosRoutes from './modules/apartados/routes.js';
import facturasRoutes from './modules/facturas/routes.js';
import creditosRoutes from './modules/creditos/routes.js';
import usersRoutes from './modules/users/routes.js';
import productsRoutes from './modules/products/routes.js';

export async function buildApp(opts: { startJobs?: boolean } = {}) {
  const { startJobs = true } = opts;
  const app = Fastify({
    trustProxy: true,
    logger:
      config.NODE_ENV === 'development'
        ? { level: 'info', transport: { target: 'pino-pretty' } }
        : { level: 'info' },
  });

  // ── Plugins ────────────────────────────────────────────────────────────────
  await app.register(cookie);

  await app.register(cors, {
    origin: config.ALLOWED_ORIGIN,
    credentials: true,
  });

  // Debe registrarse antes del rate limit: el límite se cuenta por negocio + IP.
  registerTenantResolution(app);

  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    keyGenerator: (req) => `${req.tenantSlug ?? '-'}:${req.ip}`,
    // Per-route overrides are set in route config.rateLimit
  });

  // ── Global security headers ────────────────────────────────────────────────
  registerSecurityHeaders(app);

  // ── Global error handler ───────────────────────────────────────────────────
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    app.log.error({ err }, 'unhandled error');
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Error interno del servidor' } });
  });

  // ── Background jobs ────────────────────────────────────────────────────────
  if (startJobs) {
    startCleanupJobs(app.log);
    startAutoCloseCron(app.log);
    startBackupCron(app.log);
  }

  // ── Routes ─────────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(cashRegisterRoutes, { prefix: '/api/cash-registers' });
  await app.register(boletasRoutes, { prefix: '/api/boletas' });
  await app.register(customersRoutes, { prefix: '/api/customers' });
  await app.register(expensesRoutes, { prefix: '/api/expenses' });
  await app.register(salesRoutes, { prefix: '/api/sales' });
  await app.register(notesRoutes, { prefix: '/api/notes' });
  await app.register(quotesRoutes, { prefix: '/api/quotes' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(reportsRoutes, { prefix: '/api/reports' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await app.register(apartadosRoutes, { prefix: '/api/apartados' });
  await app.register(facturasRoutes, { prefix: '/api/facturas' });
  await app.register(creditosRoutes, { prefix: '/api/creditos' });
  await app.register(usersRoutes, { prefix: '/api/users' });
  await app.register(productsRoutes, { prefix: '/api/products' });

  // Caddy (on-demand TLS) pregunta aquí antes de emitir un certificado para un subdominio.
  // Solo accesible dentro de la red Docker: el Caddyfile no expone /internal/*.
  app.get('/internal/tls-check', async (request, reply) => {
    const { domain } = request.query as { domain?: string };
    const slug = domain ? slugFromHostname(domain, config.TENANT_BASE_DOMAIN) : null;
    const tenant = slug ? findTenant(slug) : null;
    return reply.status(tenant?.status === 'active' ? 200 : 404).send();
  });

  // Health check — no auth, no rate limit (excluded via global 200/min default)
  app.get('/health', async () => {
    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      pingControlDb();
    } catch {
      dbStatus = 'error';
    }

    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      db: dbStatus,
      env: config.NODE_ENV,
      timestamp: new Date().toISOString(),
    };
  });

  return app;
}
