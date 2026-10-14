import { Hono } from 'hono';
import type { z } from 'zod';
import {
  assignBusinessSchema,
  createTenantSchema,
  platformChangePasswordSchema,
  platformLoginSchema,
  platformSettingsSchema,
  recordPaymentSchema,
  slugSchema,
  tenantStatusSchema,
  updateTenantSchema,
} from '@dosuxsoft/shared';
import { PLATFORM_COOKIE_NAME } from '../../lib/constants.js';
import { AppError } from '../../lib/errors.js';
import {
  clearSessionCookie,
  readJson,
  requestMeta,
  setSessionCookie,
  type AppContext,
  type AppEnv,
} from '../../lib/http.js';
import { rateLimit } from '../../lib/rate-limit.js';
import { SESSION_DURATION_MS } from '../../lib/session.js';
import { requirePlatformAuth } from '../../middleware/platform-auth.js';
import {
  assignTenantBusiness,
  changeSuperadminPassword,
  changeTenantStatus,
  createTenant,
  getPlatformSettings,
  getTenantDetail,
  listPlatformTenants,
  loginSuperadmin,
  logoutSuperadmin,
  recordPayment,
  regenerateSetupCode,
  updatePlatformSettings,
  updateTenant,
  voidPayment,
} from './service.js';

const SESSION_MAX_AGE_SEC = SESSION_DURATION_MS / 1000;
const FIFTEEN_MINUTES = 15 * 60_000;

// Mismo cuerpo que antes: VALIDATION_ERROR con el primer mensaje de zod.
function check<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      'VALIDATION_ERROR',
      result.error.issues[0]?.message ?? 'Datos inválidos',
      400,
    );
  }
  return result.data;
}

const slugOf = (c: AppContext): string => check(slugSchema, c.req.param('slug'));
const bodyOf = async <S extends z.ZodTypeAny>(c: AppContext, schema: S): Promise<z.infer<S>> =>
  check(schema, await readJson(c));

const platformRoutes = new Hono<AppEnv>();

// ── Sesión ───────────────────────────────────────────────────────────────────
platformRoutes.post('/auth/login', rateLimit('platform-login', 5, FIFTEEN_MINUTES), async (c) => {
  const body = await bodyOf(c, platformLoginSchema);
  const token = await loginSuperadmin(body.username, body.password, requestMeta(c));
  setSessionCookie(c, PLATFORM_COOKIE_NAME, token, SESSION_MAX_AGE_SEC);
  return c.json({ ok: true });
});

platformRoutes.post('/auth/logout', requirePlatformAuth, (c) => {
  logoutSuperadmin(c.var.sessionId, c.var.superadmin, requestMeta(c));
  clearSessionCookie(c, PLATFORM_COOKIE_NAME);
  return c.json({ ok: true });
});

platformRoutes.get('/auth/me', requirePlatformAuth, (c) =>
  c.json({ superadmin: c.var.superadmin }),
);

platformRoutes.post(
  '/auth/password',
  rateLimit('platform-password', 5, FIFTEEN_MINUTES),
  requirePlatformAuth,
  async (c) => {
    const body = await bodyOf(c, platformChangePasswordSchema);
    const token = await changeSuperadminPassword(
      c.var.superadmin,
      body.currentPassword,
      body.newPassword,
      requestMeta(c),
    );
    setSessionCookie(c, PLATFORM_COOKIE_NAME, token, SESSION_MAX_AGE_SEC);
    return c.json({ ok: true });
  },
);

// ── Negocios ─────────────────────────────────────────────────────────────────
platformRoutes.use('/tenants/*', requirePlatformAuth);
platformRoutes.use('/settings', requirePlatformAuth);

platformRoutes.get('/tenants', async (c) => c.json(await listPlatformTenants()));

platformRoutes.post('/tenants', async (c) => {
  const body = await bodyOf(c, createTenantSchema);
  return c.json(await createTenant(c.var.superadmin, body, requestMeta(c)), 201);
});

platformRoutes.get('/tenants/:slug', async (c) => c.json(await getTenantDetail(slugOf(c))));

platformRoutes.patch('/tenants/:slug', async (c) => {
  const slug = slugOf(c);
  const body = await bodyOf(c, updateTenantSchema);
  return c.json({ tenant: await updateTenant(c.var.superadmin, slug, body, requestMeta(c)) });
});

platformRoutes.put('/tenants/:slug/business', async (c) => {
  const slug = slugOf(c);
  const body = await bodyOf(c, assignBusinessSchema);
  return c.json({
    tenant: await assignTenantBusiness(c.var.superadmin, slug, body, requestMeta(c)),
  });
});

platformRoutes.post('/tenants/:slug/status', async (c) => {
  const slug = slugOf(c);
  const body = await bodyOf(c, tenantStatusSchema);
  return c.json({
    tenant: await changeTenantStatus(c.var.superadmin, slug, body.status, requestMeta(c)),
  });
});

platformRoutes.post('/tenants/:slug/setup-code', async (c) => {
  const slug = slugOf(c);
  return c.json({ setupCode: await regenerateSetupCode(c.var.superadmin, slug, requestMeta(c)) });
});

platformRoutes.post('/tenants/:slug/payments', async (c) => {
  const slug = slugOf(c);
  const body = await bodyOf(c, recordPaymentSchema);
  return c.json({ tenant: await recordPayment(c.var.superadmin, slug, body, requestMeta(c)) }, 201);
});

platformRoutes.post('/tenants/:slug/payments/:id/void', async (c) => {
  const slug = slugOf(c);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0)
    throw new AppError('VALIDATION_ERROR', 'Pago inválido', 400);
  return c.json(await voidPayment(c.var.superadmin, slug, id, requestMeta(c)));
});

// ── Configuración ────────────────────────────────────────────────────────────
platformRoutes.get('/settings', (c) => c.json(getPlatformSettings()));

platformRoutes.put('/settings', async (c) => {
  const body = await bodyOf(c, platformSettingsSchema);
  return c.json(updatePlatformSettings(c.var.superadmin, body, requestMeta(c)));
});

export default platformRoutes;
