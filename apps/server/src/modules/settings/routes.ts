import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';
import { settingsSchema } from '@sipnato/shared';
import { AppError } from '../../lib/errors.js';
import { config } from '../../config.js';
import { requireAuth } from '../../middleware/auth.js';
import { getSettings, updateSettings, generatePrintToken } from './service.js';

export default async function settingsRoutes(app: FastifyInstance) {
  // ── GET /api/settings ────────────────────────────────────────────────────
  app.get('/', { preHandler: [requireAuth] }, async () => {
    return getSettings();
  });

  // ── POST /api/settings/generate-print-token ──────────────────────────────
  // Generates a new print bridge token, stores the hash, returns the plain token ONCE.
  app.post('/generate-print-token', { preHandler: [requireAuth] }, async (request, reply) => {
    try {
      const token = await generatePrintToken({
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
      return reply.status(201).send({ token });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }
  });

  // ── GET /api/settings/backup/download ───────────────────────────────────
  // Rate limit: 5 descargas por hora (CLAUDE.md §6.3 + §6.4)
  app.get(
    '/backup/download',
    { preHandler: [requireAuth], config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (_request, reply) => {
      const latestPath = join(config.BACKUP_PATH, 'sipnato-latest.db');
      if (!existsSync(latestPath)) {
        return reply.status(404).send({ error: { code: 'BACKUP_NOT_FOUND', message: 'No hay backup disponible aún.' } });
      }
      const date = new Date().toISOString().slice(0, 10);
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="sipnato-${date}.db"`)
        .header('Cache-Control', 'no-store')
        .send(createReadStream(latestPath));
    },
  );

  // ── PUT /api/settings ────────────────────────────────────────────────────
  app.put('/', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = settingsSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } });
    }

    try {
      const updated = updateSettings(body.data, {
        ip: request.ip ?? null,
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
