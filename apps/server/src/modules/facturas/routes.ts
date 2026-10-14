import { Hono } from 'hono';
import { createFacturaSchema } from '@dosuxsoft/shared';
import { readJson, requestMetaCompact, type AppEnv } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { anularFactura, createFactura, getFactura, listFacturas } from './service.js';

const invalidId = { error: { code: 'INVALID_ID', message: 'ID inválido' } };

const facturasRoutes = new Hono<AppEnv>();

// GET /api/facturas?page=1&search=...
facturasRoutes.get('/', requireAuth, (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  return c.json(listFacturas(page, c.req.query('search')));
});

// GET /api/facturas/:id
facturasRoutes.get('/:id', requireAuth, (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json(invalidId, 400);
  return c.json(getFactura(id));
});

// POST /api/facturas
facturasRoutes.post('/', requireAuth, async (c) => {
  const parsed = createFacturaSchema.safeParse(await readJson(c));
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
  return c.json(createFactura(parsed.data, requestMetaCompact(c)), 201);
});

// POST /api/facturas/:id/anular
facturasRoutes.post('/:id/anular', requireAuth, requireRole('dueno', 'admin'), (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json(invalidId, 400);
  return c.json(anularFactura(id, requestMetaCompact(c)));
});

export default facturasRoutes;
