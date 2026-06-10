import Fastify from 'fastify';
import { config } from './config.js';
import { sqlite } from './db/client.js';

export function buildApp() {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'development'
        ? { level: 'info', transport: { target: 'pino-pretty' } }
        : { level: 'info' },
  });

  // Health check — sin autenticación, usado por Docker y monitoreo
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
