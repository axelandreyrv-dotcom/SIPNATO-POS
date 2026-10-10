import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { loginSchema, recoverSchema, setupSchema, type CurrentUser } from '@sipnato/shared';
import { COOKIE_NAME } from '../../lib/constants.js';
import {
  clearSessionCookie,
  readJson,
  requestMeta,
  setSessionCookie,
  type AppEnv,
} from '../../lib/http.js';
import { rateLimit } from '../../lib/rate-limit.js';
import { SESSION_DURATION_MS } from '../../lib/session.js';
import { requireAuth } from '../../middleware/auth.js';
import { isAdminSetup } from './repository.js';
import { loginUser, logoutUser, recoverAdmin, setupAdmin } from './service.js';

const SESSION_MAX_AGE_SEC = SESSION_DURATION_MS / 1000;
const MINUTE = 60_000;

const validationError = (message = 'Datos inválidos') => ({
  error: { code: 'VALIDATION_ERROR', message },
});

const authRoutes = new Hono<AppEnv>();

// ── GET /auth/status ─────────────────────────────────────────────────────
// Público: le dice al frontend si falta el setup.
authRoutes.get('/status', (c) => c.json({ setup: isAdminSetup() }));

// ── POST /auth/setup ──────────────────────────────────────────────────────
authRoutes.post('/setup', rateLimit('setup', 5, 15 * MINUTE), async (c) => {
  const body = setupSchema.safeParse(await readJson(c));
  if (!body.success) return c.json(validationError(body.error.issues[0]?.message), 400);

  const { recoveryCode, sessionToken } = await setupAdmin(body.data, requestMeta(c));

  setSessionCookie(c, COOKIE_NAME, sessionToken, SESSION_MAX_AGE_SEC);
  return c.json(
    {
      recoveryCode,
      message: 'Guarda este código en un lugar seguro. No se mostrará de nuevo.',
    },
    201,
  );
});

// ── POST /auth/login ──────────────────────────────────────────────────────
authRoutes.post('/login', rateLimit('login', 5, 15 * MINUTE), async (c) => {
  const body = loginSchema.safeParse(await readJson(c));
  if (!body.success) return c.json(validationError(), 400);

  const { sessionToken } = await loginUser(body.data.username, body.data.password, requestMeta(c));

  setSessionCookie(c, COOKIE_NAME, sessionToken, SESSION_MAX_AGE_SEC);
  return c.json({ ok: true });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────
authRoutes.post('/logout', requireAuth, async (c) => {
  await logoutUser(getCookie(c, COOKIE_NAME) ?? '', requestMeta(c));
  clearSessionCookie(c, COOKIE_NAME);
  return c.json({ ok: true });
});

// ── POST /auth/recover ────────────────────────────────────────────────────
authRoutes.post('/recover', rateLimit('recover', 3, 30 * MINUTE), async (c) => {
  const body = recoverSchema.safeParse(await readJson(c));
  if (!body.success) return c.json(validationError(body.error.issues[0]?.message), 400);

  const { newRecoveryCode, sessionToken, username } = await recoverAdmin(
    body.data.recoveryCode,
    body.data.newPassword,
    requestMeta(c),
  );

  setSessionCookie(c, COOKIE_NAME, sessionToken, SESSION_MAX_AGE_SEC);
  return c.json({
    newRecoveryCode,
    username,
    message: 'Contraseña actualizada. Guarda el nuevo código de recuperación.',
  });
});

// ── GET /auth/me ──────────────────────────────────────────────────────────
authRoutes.get('/me', requireAuth, (c) => {
  const user: CurrentUser = c.var.user;
  return c.json({ authenticated: true as const, user });
});

export default authRoutes;
