import { Hono } from 'hono';
import { createSaleSchema } from '@sipnato/shared';
import { readJson, requestMeta, type AppEnv } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { authorizeOrEscalate } from '../../middleware/authorization.js';
import { createSale, deleteSale, listSales } from './service.js';

const salesRoutes = new Hono<AppEnv>();

// ── POST /api/sales ───────────────────────────────────────────────────────
salesRoutes.post('/', requireAuth, async (c) => {
  const body = createSaleSchema.safeParse(await readJson(c));
  if (!body.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } }, 400);
  }
  return c.json(await createSale(body.data, requestMeta(c)), 201);
});

// ── DELETE /api/sales/:id ─────────────────────────────────────────────────
salesRoutes.delete('/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'ID inválido' } }, 400);
  }
  const authorizedBy = await authorizeOrEscalate(c, 'deleteMoneyDirectly');
  deleteSale(id, requestMeta(c), authorizedBy);
  return c.json({ ok: true });
});

// ── GET /api/sales ────────────────────────────────────────────────────────
salesRoutes.get('/', requireAuth, (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  return c.json(listSales(page));
});

export default salesRoutes;
