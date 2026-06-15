import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { createCreditoSchema, addCreditoPaymentSchema } from '@sipnato/shared';
import { createCredito, listCreditos, getCredito, addPayment, cancelCredito } from './service.js';

const creditosRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/creditos?status=activo&search=...
  app.get('/', { preHandler: requireAuth }, async (req, reply) => {
    const { status, search } = req.query as { status?: string; search?: string };
    return reply.send({ creditos: listCreditos(status, search) });
  });

  // GET /api/creditos/:id
  app.get('/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) return reply.status(400).send({ error: { code: 'INVALID_ID', message: 'ID inválido' } });
    try {
      return reply.send(getCredito(parsed));
    } catch (err) {
      if (err instanceof AppError) return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      throw err;
    }
  });

  // POST /api/creditos
  app.post('/', { preHandler: requireAuth }, async (req, reply) => {
    const body = createCreditoSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: body.error.errors[0]?.message ?? 'Datos inválidos' } });
    }
    const ua = req.headers['user-agent'];
    const meta = { ip: req.ip, ...(ua !== undefined && { userAgent: ua }) };
    try {
      return reply.status(201).send(createCredito(body.data, meta));
    } catch (err) {
      if (err instanceof AppError) return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      throw err;
    }
  });

  // POST /api/creditos/:id/payments
  app.post('/:id/payments', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) return reply.status(400).send({ error: { code: 'INVALID_ID', message: 'ID inválido' } });

    const body = addCreditoPaymentSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: body.error.errors[0]?.message ?? 'Datos inválidos' } });
    }
    const ua = req.headers['user-agent'];
    const meta = { ip: req.ip, ...(ua !== undefined && { userAgent: ua }) };
    try {
      return reply.status(201).send(addPayment(parsed, body.data, meta));
    } catch (err) {
      if (err instanceof AppError) return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      throw err;
    }
  });

  // POST /api/creditos/:id/cancel
  app.post('/:id/cancel', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) return reply.status(400).send({ error: { code: 'INVALID_ID', message: 'ID inválido' } });
    const ua = req.headers['user-agent'];
    const meta = { ip: req.ip, ...(ua !== undefined && { userAgent: ua }) };
    try {
      cancelCredito(parsed, meta);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof AppError) return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      throw err;
    }
  });
};

export default creditosRoutes;
