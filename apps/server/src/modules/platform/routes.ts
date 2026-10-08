import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  createTenantSchema,
  platformChangePasswordSchema,
  platformLoginSchema,
  platformSettingsSchema,
  recordPaymentSchema,
  slugSchema,
  tenantStatusSchema,
  updateTenantSchema,
} from '@sipnato/shared';
import { PLATFORM_COOKIE_NAME } from '../../lib/constants.js';
import { SESSION_DURATION_MS } from '../../lib/session.js';
import { requirePlatformAuth } from '../../middleware/platform-auth.js';
import {
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

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge,
  };
}

function meta(request: FastifyRequest) {
  return { ip: request.ip ?? null, userAgent: request.headers['user-agent'] ?? null };
}

// Valida y responde 400 con el primer mensaje; devuelve null si ya respondió.
function parse<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
  reply: FastifyReply,
): z.infer<S> | null {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  void reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: result.error.issues[0]?.message ?? 'Datos inválidos',
    },
  });
  return null;
}

function slugParam(request: FastifyRequest, reply: FastifyReply): string | null {
  return parse(slugSchema, (request.params as { slug?: string }).slug, reply);
}

export default async function platformRoutes(app: FastifyInstance) {
  // ── Sesión ─────────────────────────────────────────────────────────────────
  app.post(
    '/auth/login',
    {
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      if (!request.isPlatform) return reply.status(404).send();
      const body = parse(platformLoginSchema, request.body, reply);
      if (!body) return;
      const token = await loginSuperadmin(body.username, body.password, meta(request));
      reply.setCookie(PLATFORM_COOKIE_NAME, token, cookieOpts(SESSION_DURATION_MS / 1000));
      return reply.send({ ok: true });
    },
  );

  app.post('/auth/logout', { preHandler: [requirePlatformAuth] }, async (request, reply) => {
    logoutSuperadmin(request.platformSessionId, request.superadmin, meta(request));
    reply.clearCookie(PLATFORM_COOKIE_NAME, { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/auth/me', { preHandler: [requirePlatformAuth] }, async (request) => {
    return { superadmin: request.superadmin };
  });

  app.post(
    '/auth/password',
    {
      preHandler: [requirePlatformAuth],
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      const body = parse(platformChangePasswordSchema, request.body, reply);
      if (!body) return;
      const token = await changeSuperadminPassword(
        request.superadmin,
        body.currentPassword,
        body.newPassword,
        meta(request),
      );
      reply.setCookie(PLATFORM_COOKIE_NAME, token, cookieOpts(SESSION_DURATION_MS / 1000));
      return reply.send({ ok: true });
    },
  );

  // ── Negocios ───────────────────────────────────────────────────────────────
  app.get('/tenants', { preHandler: [requirePlatformAuth] }, async () => listPlatformTenants());

  app.post('/tenants', { preHandler: [requirePlatformAuth] }, async (request, reply) => {
    const body = parse(createTenantSchema, request.body, reply);
    if (!body) return;
    const result = await createTenant(request.superadmin, body, meta(request));
    return reply.status(201).send(result);
  });

  app.get('/tenants/:slug', { preHandler: [requirePlatformAuth] }, async (request, reply) => {
    const slug = slugParam(request, reply);
    if (!slug) return;
    return getTenantDetail(slug);
  });

  app.patch('/tenants/:slug', { preHandler: [requirePlatformAuth] }, async (request, reply) => {
    const slug = slugParam(request, reply);
    const body = slug && parse(updateTenantSchema, request.body, reply);
    if (!slug || !body) return;
    return { tenant: updateTenant(request.superadmin, slug, body, meta(request)) };
  });

  app.post(
    '/tenants/:slug/status',
    { preHandler: [requirePlatformAuth] },
    async (request, reply) => {
      const slug = slugParam(request, reply);
      const body = slug && parse(tenantStatusSchema, request.body, reply);
      if (!slug || !body) return;
      return { tenant: changeTenantStatus(request.superadmin, slug, body.status, meta(request)) };
    },
  );

  app.post(
    '/tenants/:slug/setup-code',
    { preHandler: [requirePlatformAuth] },
    async (request, reply) => {
      const slug = slugParam(request, reply);
      if (!slug) return;
      return { setupCode: await regenerateSetupCode(request.superadmin, slug, meta(request)) };
    },
  );

  app.post(
    '/tenants/:slug/payments',
    { preHandler: [requirePlatformAuth] },
    async (request, reply) => {
      const slug = slugParam(request, reply);
      const body = slug && parse(recordPaymentSchema, request.body, reply);
      if (!slug || !body) return;
      return reply
        .status(201)
        .send({ tenant: recordPayment(request.superadmin, slug, body, meta(request)) });
    },
  );

  app.post(
    '/tenants/:slug/payments/:id/void',
    { preHandler: [requirePlatformAuth] },
    async (request, reply) => {
      const slug = slugParam(request, reply);
      if (!slug) return;
      const id = Number((request.params as { id?: string }).id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply
          .status(400)
          .send({ error: { code: 'VALIDATION_ERROR', message: 'Pago inválido' } });
      }
      return voidPayment(request.superadmin, slug, id, meta(request));
    },
  );

  // ── Configuración ──────────────────────────────────────────────────────────
  app.get('/settings', { preHandler: [requirePlatformAuth] }, async () => getPlatformSettings());

  app.put('/settings', { preHandler: [requirePlatformAuth] }, async (request, reply) => {
    const body = parse(platformSettingsSchema, request.body, reply);
    if (!body) return;
    return updatePlatformSettings(request.superadmin, body, meta(request));
  });
}
