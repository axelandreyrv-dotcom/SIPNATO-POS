import { createReadStream, existsSync } from 'fs';
import type { FastifyInstance } from 'fastify';
import { settingsSchema } from '@sipnato/shared';
import { AppError } from '../../lib/errors.js';
import { latestBackupPath } from '../../jobs/backup.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { getSettings, updateSettings } from './service.js';

export default async function settingsRoutes(app: FastifyInstance) {
  // ── GET /api/settings ────────────────────────────────────────────────────
  // Todos los roles: los tickets impresos usan nombre, teléfono y pies de página del negocio.
  app.get('/', { preHandler: [requireAuth] }, async () => {
    return getSettings();
  });

  // ── GET /api/settings/backup/download ───────────────────────────────────
  // Solo el dueño. Rate limit: 5 descargas por hora (CLAUDE.md §6.3 + §6.4)
  app.get(
    '/backup/download',
    {
      preHandler: [requireAuth, requireRole('dueno')],
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      // Ruta derivada solo del negocio resuelto por el servidor — nunca de parámetros del cliente.
      const slug = request.tenantSlug!;
      const latestPath = latestBackupPath(slug);
      if (!existsSync(latestPath)) {
        return reply.status(404).send({ error: { code: 'BACKUP_NOT_FOUND', message: 'No hay backup disponible aún.' } });
      }
      const date = new Date().toISOString().slice(0, 10);
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="dosuxsoft-${slug}-${date}.db"`)
        .header('Cache-Control', 'no-store')
        .send(createReadStream(latestPath));
    },
  );

  // ── PUT /api/settings ────────────────────────────────────────────────────
  app.put('/', { preHandler: [requireAuth, requireRole('dueno')] }, async (request, reply) => {
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
