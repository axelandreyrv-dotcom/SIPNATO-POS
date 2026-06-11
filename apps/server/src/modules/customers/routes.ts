import type { FastifyInstance } from 'fastify';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { getCustomer, listCustomers } from './service.js';

export default async function customersRoutes(app: FastifyInstance) {
  // ── GET /api/customers ────────────────────────────────────────────────────
  app.get('/', { preHandler: [requireAuth] }, async (request) => {
    const query = request.query as Record<string, string>;
    const q = query['q'] ?? '';
    const page = Math.max(1, parseInt(query['page'] ?? '1', 10) || 1);
    return listCustomers(q, page);
  });

  // ── GET /api/customers/:id ────────────────────────────────────────────────
  app.get('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'ID inválido' } });
    }

    try {
      return getCustomer(parsed);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }
  });
}
