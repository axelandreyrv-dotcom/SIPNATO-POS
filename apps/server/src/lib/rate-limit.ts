import type { MiddlewareHandler } from 'hono';
import { clientIp, type AppContext, type AppEnv } from './http.js';

interface RateWindow {
  start: number;
  count: number;
}

// Ventana fija con una sola entrada por clave en el kv del Durable Object, sobrescrita en su
// lugar: un cliente que vuelve mucho después no deja claves viejas acumulándose. El DO ya es de
// un solo negocio, así que la clave por IP equivale a "negocio + IP" (CLAUDE.md §6.4).
export function hit(
  kv: DurableObjectStorage['kv'],
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const storageKey = `rl:${key}`;
  const stored = kv.get<RateWindow>(storageKey);
  const count = stored?.start === windowStart ? stored.count + 1 : 1;
  kv.put<RateWindow>(storageKey, { start: windowStart, count });

  const allowed = count <= limit;
  return {
    allowed,
    retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)),
  };
}

export function rateLimit(
  name: string,
  limit: number,
  windowMs: number,
  key: (c: AppContext) => string = clientIp,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const result = hit(c.var.kv, `${name}:${key(c)}`, limit, windowMs);
    if (!result.allowed) {
      c.header('Retry-After', String(result.retryAfterSec));
      return c.json(
        {
          error: {
            code: 'DEMASIADOS_INTENTOS',
            message: 'Demasiados intentos. Espera un momento antes de volver a intentarlo.',
          },
        },
        429,
      );
    }
    await next();
  };
}
