import type { FastifyInstance } from 'fastify';
import { loginSchema, recoverSchema, setupSchema } from '@sipnato/shared';
import { COOKIE_NAME } from '../../lib/constants.js';
import { AppError } from '../../lib/errors.js';
import { SESSION_DURATION_MS } from '../../lib/session.js';
import { requireAuth } from '../../middleware/auth.js';
import { isAdminSetup } from './repository.js';
import { loginAdmin, logoutAdmin, recoverAdmin, setupAdmin } from './service.js';

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge,
  };
}

function clientIp(request: Parameters<typeof requireAuth>[0]): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? null;
  return request.ip ?? null;
}

export default async function authRoutes(app: FastifyInstance) {
  // ── GET /auth/status ─────────────────────────────────────────────────────
  // Public — tells the frontend whether setup is needed.
  app.get('/status', async () => {
    const setup = await isAdminSetup();
    return { setup };
  });

  // ── POST /auth/setup ──────────────────────────────────────────────────────
  app.post('/setup', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = setupSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } });

    try {
      const { recoveryCode, sessionToken } = await setupAdmin(
        body.data.password,
        clientIp(request),
        request.headers['user-agent'] ?? null,
      );

      reply.setCookie(COOKIE_NAME, sessionToken, cookieOpts(SESSION_DURATION_MS / 1000));
      return reply.status(201).send({
        recoveryCode,
        message: 'Guarda este código en un lugar seguro. No se mostrará de nuevo.',
      });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }
  });

  // ── POST /auth/login ──────────────────────────────────────────────────────
  app.post('/login', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } });

    try {
      const { sessionToken } = await loginAdmin(
        body.data.password,
        clientIp(request),
        request.headers['user-agent'] ?? null,
      );

      reply.setCookie(COOKIE_NAME, sessionToken, cookieOpts(SESSION_DURATION_MS / 1000));
      return reply.send({ ok: true });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }
  });

  // ── POST /auth/logout ─────────────────────────────────────────────────────
  app.post('/logout', { preHandler: [requireAuth] }, async (request, reply) => {
    const token = request.cookies[COOKIE_NAME] ?? '';
    await logoutAdmin(token, clientIp(request), request.headers['user-agent'] ?? null);
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.send({ ok: true });
  });

  // ── POST /auth/recover ────────────────────────────────────────────────────
  app.post('/recover', {
    config: { rateLimit: { max: 3, timeWindow: '30 minutes' } },
  }, async (request, reply) => {
    const body = recoverSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } });

    try {
      const { newRecoveryCode, sessionToken } = await recoverAdmin(
        body.data.recoveryCode,
        body.data.newPassword,
        clientIp(request),
        request.headers['user-agent'] ?? null,
      );

      reply.setCookie(COOKIE_NAME, sessionToken, cookieOpts(SESSION_DURATION_MS / 1000));
      return reply.send({
        newRecoveryCode,
        message: 'Contraseña actualizada. Guarda el nuevo código de recuperación.',
      });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }
  });

  // ── GET /auth/me ──────────────────────────────────────────────────────────
  app.get('/me', { preHandler: [requireAuth] }, async () => {
    return { authenticated: true };
  });
}
