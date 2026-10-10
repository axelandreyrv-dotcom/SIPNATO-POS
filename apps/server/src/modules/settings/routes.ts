import { Hono } from 'hono';
import { settingsSchema } from '@sipnato/shared';
import { AppError } from '../../lib/errors.js';
import { readJson, requestMeta, type AppEnv } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { getSettings, updateSettings } from './service.js';

const settingsRoutes = new Hono<AppEnv>();

// ── GET /api/settings ────────────────────────────────────────────────────
// Todos los roles: los tickets impresos usan nombre, teléfono y pies de página del negocio.
settingsRoutes.get('/', requireAuth, (c) => c.json(getSettings()));

// ── GET /api/settings/backup/download ───────────────────────────────────
// Solo el dueño. Los respaldos pasan a R2 en otra etapa: por ahora la ruta conserva sus
// permisos y responde que aún no está disponible.
settingsRoutes.get('/backup/download', requireAuth, requireRole('dueno'), () => {
  throw new AppError('NO_IMPLEMENTADO', 'La descarga de respaldos aún no está disponible', 501);
});

// ── PUT /api/settings ────────────────────────────────────────────────────
settingsRoutes.put('/', requireAuth, requireRole('dueno'), async (c) => {
  const body = settingsSchema.safeParse(await readJson(c));
  if (!body.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } }, 400);
  }
  return c.json(updateSettings(body.data, requestMeta(c)));
});

export default settingsRoutes;
