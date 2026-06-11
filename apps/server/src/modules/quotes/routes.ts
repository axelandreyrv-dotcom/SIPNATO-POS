import type { FastifyInstance } from 'fastify';
import { createQuoteSchema } from '@sipnato/shared';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { createQuote, deleteQuote, getQuote, listQuotes } from './service.js';

export default async function quotesRoutes(app: FastifyInstance) {
  // ── POST /api/quotes ──────────────────────────────────────────────────────
  app.post('/', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = createQuoteSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } });
    }

    try {
      const quote = createQuote(body.data, {
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
      return reply.status(201).send(quote);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }
  });

  // ── GET /api/quotes ───────────────────────────────────────────────────────
  app.get('/', { preHandler: [requireAuth] }, async (request) => {
    const query = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(query['page'] ?? '1', 10) || 1);
    return listQuotes(page);
  });

  // ── GET /api/quotes/:id ───────────────────────────────────────────────────
  app.get('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'ID inválido' } });
    }

    try {
      return getQuote(parsed);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }
  });

  // ── DELETE /api/quotes/:id ────────────────────────────────────────────────
  app.delete('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'ID inválido' } });
    }

    try {
      deleteQuote(parsed, {
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
}
