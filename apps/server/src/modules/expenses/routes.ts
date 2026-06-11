import type { FastifyInstance } from 'fastify';
import { createExpenseSchema } from '@sipnato/shared';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { createExpense, deleteExpense, listExpenses } from './service.js';

export default async function expensesRoutes(app: FastifyInstance) {
  // ── POST /api/expenses ────────────────────────────────────────────────────
  app.post('/', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = createExpenseSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } });
    }

    try {
      const expense = createExpense(body.data, {
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
      return reply.status(201).send(expense);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }
  });

  // ── DELETE /api/expenses/:id ──────────────────────────────────────────────
  app.delete('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'ID inválido' } });
    }

    try {
      deleteExpense(parsed, {
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

  // ── GET /api/expenses ─────────────────────────────────────────────────────
  app.get('/', { preHandler: [requireAuth] }, async () => {
    return listExpenses();
  });
}
