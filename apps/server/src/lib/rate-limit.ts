import type { MiddlewareHandler } from 'hono';
import { clientIp, type AppContext, type AppEnv } from './http.js';

// Ventana fija: un contador por clave y ventana en el kv del Durable Object. El DO ya es de
// un solo negocio, así que la clave por IP equivale a "negocio + IP" (CLAUDE.md §6.4).
export function hit(
  kv: DurableObjectStorage['kv'],
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const storageKey = `rl:${key}:${windowStart}`;
  const count = (kv.get<number>(storageKey) ?? 0) + 1;
  kv.put(storageKey, count);
  kv.delete(`rl:${key}:${windowStart - windowMs}`);

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
