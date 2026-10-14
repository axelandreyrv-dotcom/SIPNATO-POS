import { Hono } from 'hono';
import { ownerProfileSchema } from '@dosuxsoft/shared';
import { readJson, requestMeta, type AppEnv } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { getProfile } from './repository.js';
import { updateOwnerProfile } from './service.js';

const businessRoutes = new Hono<AppEnv>();

// ── GET /api/business ─────────────────────────────────────────────────────
// Todos los roles: el frontend arma el menú y el formulario de órdenes con esto.
businessRoutes.get('/', requireAuth, (c) => c.json(getProfile()));

// ── PUT /api/business ─────────────────────────────────────────────────────
// Solo nombres y campos de las órdenes: el tipo de negocio y los módulos los asigna la plataforma.
businessRoutes.put('/', requireAuth, requireRole('dueno'), async (c) => {
  const body = ownerProfileSchema.safeParse(await readJson(c));
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
  return c.json(updateOwnerProfile(body.data, requestMeta(c)));
});

export default businessRoutes;
