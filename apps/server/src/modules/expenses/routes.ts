import { Hono } from 'hono';
import { createExpenseSchema } from '@dosuxsoft/shared';
import { readJson, requestMeta, type AppEnv } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { authorizeOrEscalate } from '../../middleware/authorization.js';
import { createExpense, deleteExpense, listExpenses } from './service.js';

const expensesRoutes = new Hono<AppEnv>();

// ── POST /api/expenses ────────────────────────────────────────────────────
expensesRoutes.post('/', requireAuth, async (c) => {
  const body = createExpenseSchema.safeParse(await readJson(c));
  if (!body.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } }, 400);
  }
  return c.json(createExpense(body.data, requestMeta(c)), 201);
});

// ── DELETE /api/expenses/:id ──────────────────────────────────────────────
expensesRoutes.delete('/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'ID inválido' } }, 400);
  }
  const authorizedBy = await authorizeOrEscalate(c, 'deleteMoneyDirectly');
  deleteExpense(id, requestMeta(c), authorizedBy);
  return c.json({ ok: true });
});

// ── GET /api/expenses ─────────────────────────────────────────────────────
expensesRoutes.get('/', requireAuth, (c) => c.json(listExpenses()));

export default expensesRoutes;
