import { Hono } from 'hono';
import { openCashRegisterSchema } from '@sipnato/shared';
import { readJson, requestMeta, type AppEnv } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  closeCashRegister,
  getCashRegisterById,
  getCurrentCashRegister,
  listCashRegisters,
  openCashRegister,
} from './service.js';

const cashRegisterRoutes = new Hono<AppEnv>();

// ── POST /api/cash-registers/open ────────────────────────────────────────
cashRegisterRoutes.post('/open', requireAuth, async (c) => {
  const body = openCashRegisterSchema.safeParse(await readJson(c));
  if (!body.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } }, 400);
  }
  return c.json(openCashRegister(body.data.openingAmount, requestMeta(c)), 201);
});

// ── POST /api/cash-registers/close ───────────────────────────────────────
cashRegisterRoutes.post('/close', requireAuth, (c) =>
  c.json(closeCashRegister('manual', undefined, requestMeta(c))),
);

// ── GET /api/cash-registers/current ──────────────────────────────────────
cashRegisterRoutes.get('/current', requireAuth, (c) => c.json(getCurrentCashRegister()));

// ── GET /api/cash-registers ───────────────────────────────────────────────
cashRegisterRoutes.get('/', requireAuth, (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  return c.json(listCashRegisters(page));
});

// ── GET /api/cash-registers/:id ───────────────────────────────────────────
cashRegisterRoutes.get('/:id', requireAuth, (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'ID inválido' } }, 400);
  }
  const register = getCashRegisterById(id);
  if (!register) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Caja no encontrada' } }, 404);
  }
  return c.json(register);
});

export default cashRegisterRoutes;
