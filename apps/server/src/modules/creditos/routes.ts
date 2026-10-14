import { Hono } from 'hono';
import { createCreditoSchema, addCreditoPaymentSchema } from '@dosuxsoft/shared';
import { readJson, requestMetaCompact, type AppEnv } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createCredito, listCreditos, getCredito, addPayment, cancelCredito } from './service.js';

const invalidId = { error: { code: 'INVALID_ID', message: 'ID inválido' } };

const creditosRoutes = new Hono<AppEnv>();

// GET /api/creditos?status=activo&search=...
creditosRoutes.get('/', requireAuth, (c) =>
  c.json({ creditos: listCreditos(c.req.query('status'), c.req.query('search')) }),
);

// GET /api/creditos/:id
creditosRoutes.get('/:id', requireAuth, (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json(invalidId, 400);
  return c.json(getCredito(id));
});

// POST /api/creditos
creditosRoutes.post('/', requireAuth, async (c) => {
  const body = createCreditoSchema.safeParse(await readJson(c));
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
  return c.json(createCredito(body.data, requestMetaCompact(c)), 201);
});

// POST /api/creditos/:id/payments
creditosRoutes.post('/:id/payments', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json(invalidId, 400);

  const body = addCreditoPaymentSchema.safeParse(await readJson(c));
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
  return c.json(addPayment(id, body.data, requestMetaCompact(c)), 201);
});

// POST /api/creditos/:id/cancel
creditosRoutes.post('/:id/cancel', requireAuth, requireRole('dueno', 'admin'), (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json(invalidId, 400);
  cancelCredito(id, requestMetaCompact(c));
  return c.body(null, 204);
});

export default creditosRoutes;
