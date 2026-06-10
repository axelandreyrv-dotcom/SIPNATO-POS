import type { FastifyInstance } from 'fastify';
import { settingsSchema } from '@sipnato/shared';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { getSettings, updateSettings } from './service.js';

function clientIp(request: Parameters<typeof requireAuth>[0]): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? null;
  return request.ip ?? null;
}

export default async function settingsRoutes(app: FastifyInstance) {
  // ── GET /api/settings ────────────────────────────────────────────────────
  app.get('/', { preHandler: [requireAuth] }, async () => {
    return getSettings();
  });

  // ── PUT /api/settings ────────────────────────────────────────────────────
  app.put('/', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = settingsSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } });
    }

    try {
      const updated = await updateSettings(body.data, {
        ip: clientIp(request),
        userAgent: request.headers['user-agent'] ?? null,
      });
      return reply.send(updated);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }
  });
}
