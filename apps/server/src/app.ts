import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { config } from './config.js';
import { sqlite } from './db/client.js';
import { startCleanupJobs } from './jobs/cleanup-sessions.js';
import { registerSecurityHeaders } from './middleware/security-headers.js';
import authRoutes from './modules/auth/routes.js';
import settingsRoutes from './modules/settings/routes.js';

export async function buildApp() {
  const app = Fastify({
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

  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    // Per-route overrides are set in route config.rateLimit
    keyGenerator: (request) => {
      const forwarded = request.headers['x-forwarded-for'];
      if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? request.ip;
      return request.ip;
    },
  });

  // ── Global security headers ────────────────────────────────────────────────
  registerSecurityHeaders(app);

  // ── Background jobs ────────────────────────────────────────────────────────
  startCleanupJobs(app.log);

  // ── Routes ─────────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });

  // Health check — no auth, no rate limit (excluded via global 200/min default)
  app.get('/health', async () => {
    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      sqlite.prepare('SELECT 1').get();
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
