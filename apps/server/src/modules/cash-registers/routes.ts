import type { FastifyInstance } from 'fastify';
import { openCashRegisterSchema } from '@sipnato/shared';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  closeCashRegister,
  getCashRegisterById,
  getCurrentCashRegister,
  listCashRegisters,
  openCashRegister,
} from './service.js';

export default async function cashRegisterRoutes(app: FastifyInstance) {
  // ── POST /api/cash-registers/open ────────────────────────────────────────
  app.post('/open', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = openCashRegisterSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } });
    }

    try {
      const result = openCashRegister(body.data.openingAmount, {
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }
  });

  // ── POST /api/cash-registers/close ───────────────────────────────────────
  app.post('/close', { preHandler: [requireAuth] }, async (request, reply) => {
    try {
      const totals = closeCashRegister('manual', undefined, {
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
      return reply.send(totals);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }
  });

  // ── GET /api/cash-registers/current ──────────────────────────────────────
  app.get('/current', { preHandler: [requireAuth] }, async () => {
    return getCurrentCashRegister();
  });

  // ── GET /api/cash-registers ───────────────────────────────────────────────
  app.get('/', { preHandler: [requireAuth] }, async (request) => {
    const query = (request.query as Record<string, string>);
    const page = Math.max(1, parseInt(query['page'] ?? '1', 10) || 1);
    return listCashRegisters(page);
  });

  // ── GET /api/cash-registers/:id ───────────────────────────────────────────
  app.get('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'ID inválido' } });
    }
    const register = getCashRegisterById(parsed);
    if (!register) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Caja no encontrada' } });
    }
    return register;
  });
}
