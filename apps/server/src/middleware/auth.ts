import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { setActor, type UserRole } from '../db/client.js';
import { COOKIE_NAME } from '../lib/constants.js';
import { clearSessionCookie, type AppEnv } from '../lib/http.js';
import { touchSession, verifySession } from '../lib/session.js';

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, COOKIE_NAME);

  if (!token) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Sesión requerida' } }, 401);
  }

  const result = await verifySession(token);

  if (!result) {
    clearSessionCookie(c, COOKIE_NAME);
    return c.json({ error: { code: 'SESSION_EXPIRED', message: 'Sesión expirada' } }, 401);
  }

  await touchSession(result.session.id);
  c.set('sessionId', result.session.id);
  c.set('user', result.user);
  setActor(result.user);
  await next();
};

// Usar DESPUÉS de requireAuth: `routes.post('/', requireAuth, requireRole('dueno', 'admin'), …)`.
export function requireRole(...roles: UserRole[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!roles.includes(c.var.user.role)) {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'No tienes permiso para esta acción' } },
        403,
      );
    }
    await next();
  };
}
