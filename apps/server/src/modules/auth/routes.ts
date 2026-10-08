import type { FastifyInstance, FastifyRequest } from 'fastify';
import { loginSchema, recoverSchema, setupSchema, type CurrentUser } from '@sipnato/shared';
import { COOKIE_NAME } from '../../lib/constants.js';
import { SESSION_DURATION_MS } from '../../lib/session.js';
import { requireAuth } from '../../middleware/auth.js';
import { isAdminSetup } from './repository.js';
import { loginUser, logoutUser, recoverAdmin, setupAdmin } from './service.js';

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

const validationError = (message = 'Datos inválidos') => ({ error: { code: 'VALIDATION_ERROR', message } });

export default async function authRoutes(app: FastifyInstance) {
  // ── GET /auth/status ─────────────────────────────────────────────────────
  // Public — tells the frontend whether setup is needed.
  app.get('/status', async () => {
    return { setup: isAdminSetup() };
  });

  // ── POST /auth/setup ──────────────────────────────────────────────────────
  app.post('/setup', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = setupSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send(validationError(body.error.issues[0]?.message));

    const { recoveryCode, sessionToken } = await setupAdmin(body.data, meta(request));

    reply.setCookie(COOKIE_NAME, sessionToken, cookieOpts(SESSION_DURATION_MS / 1000));
    return reply.status(201).send({
      recoveryCode,
      message: 'Guarda este código en un lugar seguro. No se mostrará de nuevo.',
    });
  });

  // ── POST /auth/login ──────────────────────────────────────────────────────
  app.post('/login', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send(validationError());

    const { sessionToken } = await loginUser(body.data.username, body.data.password, meta(request));

    reply.setCookie(COOKIE_NAME, sessionToken, cookieOpts(SESSION_DURATION_MS / 1000));
    return reply.send({ ok: true });
  });

  // ── POST /auth/logout ─────────────────────────────────────────────────────
  app.post('/logout', { preHandler: [requireAuth] }, async (request, reply) => {
    const token = request.cookies[COOKIE_NAME] ?? '';
    await logoutUser(token, meta(request));
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.send({ ok: true });
  });

  // ── POST /auth/recover ────────────────────────────────────────────────────
  app.post('/recover', {
    config: { rateLimit: { max: 3, timeWindow: '30 minutes' } },
  }, async (request, reply) => {
    const body = recoverSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send(validationError(body.error.issues[0]?.message));

    const { newRecoveryCode, sessionToken, username } = await recoverAdmin(
      body.data.recoveryCode,
      body.data.newPassword,
      meta(request),
    );

    reply.setCookie(COOKIE_NAME, sessionToken, cookieOpts(SESSION_DURATION_MS / 1000));
    return reply.send({
      newRecoveryCode,
      username,
      message: 'Contraseña actualizada. Guarda el nuevo código de recuperación.',
    });
  });

  // ── GET /auth/me ──────────────────────────────────────────────────────────
  app.get('/me', { preHandler: [requireAuth] }, async (request): Promise<{ authenticated: true; user: CurrentUser }> => {
    return { authenticated: true, user: request.user };
  });
}
