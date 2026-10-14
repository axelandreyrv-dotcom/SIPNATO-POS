import { Hono } from 'hono';
import { createBoletaSchema } from '@dosuxsoft/shared';
import { readJson, requestMeta, type AppEnv } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { createBoleta, getBoleta, listBoletas } from './service.js';

const boletasRoutes = new Hono<AppEnv>();

// ── POST /api/boletas ─────────────────────────────────────────────────────
boletasRoutes.post('/', requireAuth, async (c) => {
  const body = createBoletaSchema.safeParse(await readJson(c));
  if (!body.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: body.error.issues[0]?.message ?? 'Datos inválidos',
        },
      },
      400,
    );
  }
  return c.json(createBoleta(body.data, requestMeta(c)), 201);
});

// ── GET /api/boletas ──────────────────────────────────────────────────────
boletasRoutes.get('/', requireAuth, (c) => {
  const q = c.req.query('q') ?? '';
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  return c.json(listBoletas(q, page));
});

// ── GET /api/boletas/:id ──────────────────────────────────────────────────
boletasRoutes.get('/:id', requireAuth, (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'ID inválido' } }, 400);
  }
  return c.json(getBoleta(id));
});

export default boletasRoutes;
