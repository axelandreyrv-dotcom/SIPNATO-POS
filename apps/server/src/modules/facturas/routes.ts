import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { createFacturaSchema } from '@sipnato/shared';
import { anularFactura, createFactura, getFactura, listFacturas } from './service.js';

const facturasRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/facturas?page=1&search=...
  app.get('/', { preHandler: requireAuth }, async (req, reply) => {
    const { page, search } = req.query as { page?: string; search?: string };
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
    return reply.send(listFacturas(pageNum, search));
  });

  // GET /api/facturas/:id
  app.get('/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) return reply.status(400).send({ error: { code: 'INVALID_ID', message: 'ID inválido' } });
    try {
      return reply.send(getFactura(parsed));
    } catch (err) {
      if (err instanceof AppError) return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      throw err;
    }
  });

  // POST /api/facturas
  app.post('/', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createFacturaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Datos inválidos' } });
    }
    const ua = req.headers['user-agent'];
    const meta = { ip: req.ip, ...(ua !== undefined && { userAgent: ua }) };
    try {
      const factura = createFactura(parsed.data, meta);
      return reply.status(201).send(factura);
    } catch (err) {
      if (err instanceof AppError) return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      throw err;
    }
  });

  // POST /api/facturas/:id/anular
  app.post('/:id/anular', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) return reply.status(400).send({ error: { code: 'INVALID_ID', message: 'ID inválido' } });
    const ua = req.headers['user-agent'];
    const meta = { ip: req.ip, ...(ua !== undefined && { userAgent: ua }) };
    try {
      return reply.send(anularFactura(parsed, meta));
    } catch (err) {
      if (err instanceof AppError) return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      throw err;
    }
  });
};

export default facturasRoutes;
