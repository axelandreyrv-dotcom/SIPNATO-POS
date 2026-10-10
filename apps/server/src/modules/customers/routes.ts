import { Hono } from 'hono';
import type { AppEnv } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { getCustomer, listCustomers } from './service.js';

const customersRoutes = new Hono<AppEnv>();

// ── GET /api/customers ────────────────────────────────────────────────────
customersRoutes.get('/', requireAuth, (c) => {
  const q = c.req.query('q') ?? '';
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  return c.json(listCustomers(q, page));
});

// ── GET /api/customers/:id ────────────────────────────────────────────────
customersRoutes.get('/:id', requireAuth, (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'ID inválido' } }, 400);
  }
  return c.json(getCustomer(id));
});

export default customersRoutes;
