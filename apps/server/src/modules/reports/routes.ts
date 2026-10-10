import { Hono } from 'hono';
import {
  reportExportFilterSchema,
  reportSalesFilterSchema,
  reportSummaryFilterSchema,
} from '@sipnato/shared';
import type { AppEnv } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { getDaily, getSalesExport, getSalesList, getSummary } from './service.js';

const invalidParams = { error: { code: 'VALIDATION_ERROR', message: 'Parámetros inválidos' } };

const reportsRoutes = new Hono<AppEnv>();

// ── GET /api/reports/sales ──────────────────────────────────────────────────
reportsRoutes.get('/sales', requireAuth, (c) => {
  const parsed = reportSalesFilterSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json(invalidParams, 400);
  return c.json(getSalesList(parsed.data));
});

// ── GET /api/reports/sales/export ───────────────────────────────────────────
// Hasta 5 000 filas para descargar en CSV, sin paginación.
reportsRoutes.get('/sales/export', requireAuth, (c) => {
  const parsed = reportExportFilterSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json(invalidParams, 400);
  return c.json(getSalesExport(parsed.data));
});

// ── GET /api/reports/summary ────────────────────────────────────────────────
reportsRoutes.get('/summary', requireAuth, (c) => {
  const parsed = reportSummaryFilterSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json(invalidParams, 400);
  return c.json(getSummary(parsed.data));
});

// ── GET /api/reports/daily ──────────────────────────────────────────────────
reportsRoutes.get('/daily', requireAuth, (c) => {
  const parsed = reportSummaryFilterSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json(invalidParams, 400);
  return c.json(getDaily(parsed.data));
});

export default reportsRoutes;
