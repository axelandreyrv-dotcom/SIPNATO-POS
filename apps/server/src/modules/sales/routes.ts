import type { FastifyInstance } from 'fastify';
import { createSaleSchema } from '@sipnato/shared';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { createSale, deleteSale, listSales } from './service.js';

export default async function salesRoutes(app: FastifyInstance) {
  // ── POST /api/sales ───────────────────────────────────────────────────────
  app.post('/', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = createSaleSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } });
    }

    try {
      const sale = createSale(body.data, {
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
      return reply.status(201).send(sale);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }
  });

  // ── DELETE /api/sales/:id ─────────────────────────────────────────────────
  app.delete('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'ID inválido' } });
    }

    try {
      deleteSale(parsed, {
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
      return reply.send({ ok: true });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }
  });

  // ── GET /api/sales ────────────────────────────────────────────────────────
  app.get('/', { preHandler: [requireAuth] }, async (request) => {
    const query = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(query['page'] ?? '1', 10) || 1);
    return listSales(page);
  });
}
