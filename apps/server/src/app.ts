import Fastify from 'fastify';
import { config } from './config.js';

export function buildApp() {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'development'
        ? { level: 'info', transport: { target: 'pino-pretty' } }
        : { level: 'info' },
  });

  // Health check — sin autenticación, usado por Docker y monitoreo
  app.get('/health', async () => {
    return {
      status: 'ok',
      env: config.NODE_ENV,
      timestamp: new Date().toISOString(),
    };
  });

  return app;
}
