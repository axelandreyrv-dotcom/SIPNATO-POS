import { Hono } from 'hono';
import { createApartadoSchema, addApartadoPaymentSchema } from '@sipnato/shared';
import { readJson, requestMetaCompact, type AppEnv } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  createApartado,
  listApartados,
  getApartado,
  addPayment,
  cancelApartado,
} from './service.js';

const invalidId = { error: { code: 'INVALID_ID', message: 'ID inválido' } };

const apartadosRoutes = new Hono<AppEnv>();

// GET /api/apartados?status=activo&search=...
apartadosRoutes.get('/', requireAuth, (c) => {
  const status = c.req.query('status');
  const search = c.req.query('search');
  return c.json(
    listApartados({
      ...(status !== undefined && { status }),
      ...(search !== undefined && { search }),
    }),
  );
});

// GET /api/apartados/:id
apartadosRoutes.get('/:id', requireAuth, (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json(invalidId, 400);
  return c.json(getApartado(id));
});

// POST /api/apartados
apartadosRoutes.post('/', requireAuth, async (c) => {
  const parsed = createApartadoSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message ?? 'Datos inválidos',
        },
      },
      400,
    );
  }
  return c.json(createApartado(parsed.data, requestMetaCompact(c)), 201);
});

// POST /api/apartados/:id/payments
apartadosRoutes.post('/:id/payments', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json(invalidId, 400);

  const body = addApartadoPaymentSchema.safeParse(await readJson(c));
  if (!body.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: body.error.errors[0]?.message ?? 'Datos inválidos',
        },
      },
      400,
    );
  }
  return c.json(addPayment(id, body.data, requestMetaCompact(c)).apartado);
});

// POST /api/apartados/:id/cancel
apartadosRoutes.post('/:id/cancel', requireAuth, requireRole('dueno', 'admin'), (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json(invalidId, 400);
  return c.json(cancelApartado(id, requestMetaCompact(c)));
});

export default apartadosRoutes;
