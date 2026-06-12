import type { FastifyInstance } from 'fastify';
import { reportExportFilterSchema, reportSalesFilterSchema, reportSummaryFilterSchema } from '@sipnato/shared';
import { requireAuth } from '../../middleware/auth.js';
import { getDaily, getSalesExport, getSalesList, getSummary } from './service.js';

export default async function reportsRoutes(app: FastifyInstance) {
  // ── GET /api/reports/sales ──────────────────────────────────────────────────
  app.get('/sales', { preHandler: [requireAuth] }, (request, reply) => {
    const parsed = reportSalesFilterSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Parámetros inválidos' } });
    }
    return getSalesList(parsed.data);
  });

  // ── GET /api/reports/sales/export ───────────────────────────────────────────
  // Returns up to 5 000 rows for CSV download — no pagination.
  app.get('/sales/export', { preHandler: [requireAuth] }, (request, reply) => {
    const parsed = reportExportFilterSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Parámetros inválidos' } });
    }
    return getSalesExport(parsed.data);
  });

  // ── GET /api/reports/summary ────────────────────────────────────────────────
  app.get('/summary', { preHandler: [requireAuth] }, (request, reply) => {
    const parsed = reportSummaryFilterSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Parámetros inválidos' } });
    }
    return getSummary(parsed.data);
  });

  // ── GET /api/reports/daily ──────────────────────────────────────────────────
  app.get('/daily', { preHandler: [requireAuth] }, (request, reply) => {
    const parsed = reportSummaryFilterSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Parámetros inválidos' } });
    }
    return getDaily(parsed.data);
  });
}
