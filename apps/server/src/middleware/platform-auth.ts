import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { PLATFORM_COOKIE_NAME } from '../lib/constants.js';
import { clearSessionCookie, type AppEnv } from '../lib/http.js';
import { verifyPlatformSession } from '../modules/platform/service.js';

// Solo existe dentro del Durable Object de la plataforma, que solo recibe las peticiones de
// admin.<dominio>: la cookie de un negocio (otro nombre) nunca sirve aquí.
export const requirePlatformAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, PLATFORM_COOKIE_NAME);
  if (!token) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Sesión requerida' } }, 401);
  }

  const result = await verifyPlatformSession(token);
  if (!result) {
    clearSessionCookie(c, PLATFORM_COOKIE_NAME);
    return c.json({ error: { code: 'SESSION_EXPIRED', message: 'Sesión expirada' } }, 401);
  }

  c.set('superadmin', result.admin);
  c.set('sessionId', result.sessionId);
  await next();
};
