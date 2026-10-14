import { Hono } from 'hono';
import { settingsSchema } from '@dosuxsoft/shared';
import { currentTenant } from '../../db/client.js';
import { todayCR } from '../../lib/cr-time.js';
import { readJson, requestMeta, sameOriginOnly, type AppEnv } from '../../lib/http.js';
import { rateLimit } from '../../lib/rate-limit.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { downloadBackup, getSettings, updateSettings } from './service.js';

const settingsRoutes = new Hono<AppEnv>();

// ── GET /api/settings ────────────────────────────────────────────────────
// Todos los roles: los tickets impresos usan nombre, teléfono y pies de página del negocio.
settingsRoutes.get('/', requireAuth, (c) => c.json(getSettings()));

// ── GET /api/settings/backup/download ───────────────────────────────────
// Solo el dueño. 5 descargas por hora por sesión (CLAUDE.md §6.4). El nombre del archivo lo arma
// el servidor con el negocio resuelto por el Host y la fecha de Costa Rica; nada viene del cliente.
// Es un GET con efectos (bitácora y cupo): otro subdominio no debe poder dispararlo.
settingsRoutes.get(
  '/backup/download',
  sameOriginOnly,
  requireAuth,
  requireRole('dueno'),
  rateLimit('backup', 5, 60 * 60_000, (c) => c.var.sessionId),
  (c) => {
    const backup = downloadBackup(c.var.storage, requestMeta(c));
    const filename = `dosuxsoft-${currentTenant().slug}-${todayCR()}.json`;
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.json(backup);
  },
);

// ── PUT /api/settings ────────────────────────────────────────────────────
settingsRoutes.put('/', requireAuth, requireRole('dueno'), async (c) => {
  const body = settingsSchema.safeParse(await readJson(c));
  if (!body.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } }, 400);
  }
  return c.json(await updateSettings(body.data, requestMeta(c), c.var.storage));
});

export default settingsRoutes;
