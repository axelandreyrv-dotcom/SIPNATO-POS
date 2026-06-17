import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createSaleSchema } from '@sipnato/shared';
import { AppError, PinInvalido, PinRequerido } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { getSalesPinSet, verifySalesPin } from '../settings/service.js';
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

    if (getSalesPinSet()) {
      const bodyParsed = z.object({ pin: z.string().min(1) }).safeParse(request.body);
      if (!bodyParsed.success) {
        const err = new PinRequerido();
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      const valid = await verifySalesPin(bodyParsed.data.pin);
      if (!valid) {
        const err = new PinInvalido();
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
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
