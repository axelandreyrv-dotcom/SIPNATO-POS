import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { createApartadoSchema, addApartadoPaymentSchema } from '@sipnato/shared';
import {
  createApartado,
  listApartados,
  getApartado,
  addPayment,
  cancelApartado,
} from './service.js';

const apartadosRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/apartados?status=activo&search=...
  app.get('/', { preHandler: requireAuth }, async (req, reply) => {
    const { status, search } = req.query as { status?: string; search?: string };
    const result = listApartados({
      ...(status !== undefined && { status }),
      ...(search !== undefined && { search }),
    });
    return reply.send(result);
  });

  // GET /api/apartados/:id
  app.get('/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) return reply.status(400).send({ error: { code: 'INVALID_ID', message: 'ID inválido' } });

    try {
      const apartado = getApartado(parsed);
      return reply.send(apartado);
    } catch (err) {
      if (err instanceof AppError) return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      throw err;
    }
  });

  // POST /api/apartados
  app.post('/', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createApartadoSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Datos inválidos' } });
    }

    const ua = req.headers['user-agent'];
    const meta = { ip: req.ip, ...(ua !== undefined && { userAgent: ua }) };
    try {
      const apartado = createApartado(parsed.data, meta);
      return reply.status(201).send(apartado);
    } catch (err) {
      if (err instanceof AppError) return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      throw err;
    }
  });

  // POST /api/apartados/:id/payments
  app.post('/:id/payments', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) return reply.status(400).send({ error: { code: 'INVALID_ID', message: 'ID inválido' } });

    const bodyParsed = addApartadoPaymentSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: bodyParsed.error.errors[0]?.message ?? 'Datos inválidos' } });
    }

    const ua = req.headers['user-agent'];
    const meta = { ip: req.ip, ...(ua !== undefined && { userAgent: ua }) };
    try {
      const result = addPayment(parsed, bodyParsed.data, meta);
      return reply.send(result.apartado);
    } catch (err) {
      if (err instanceof AppError) return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      throw err;
    }
  });

  // POST /api/apartados/:id/cancel
  app.post('/:id/cancel', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) return reply.status(400).send({ error: { code: 'INVALID_ID', message: 'ID inválido' } });

    const ua = req.headers['user-agent'];
    const meta = { ip: req.ip, ...(ua !== undefined && { userAgent: ua }) };
    try {
      const apartado = cancelApartado(parsed, meta);
      return reply.send(apartado);
    } catch (err) {
      if (err instanceof AppError) return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      throw err;
    }
  });
};

export default apartadosRoutes;
