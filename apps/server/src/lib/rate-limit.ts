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

// Como `hit`, pero sin contar: ¿la clave ya agotó su límite en esta ventana?
export function peekLimit(
  kv: DurableObjectStorage['kv'],
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const stored = kv.get<RateWindow>(`rl:${key}`);
  const allowed = stored?.start !== windowStart || stored.count < limit;
  return {
    allowed,
    retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)),
  };
}

export function tooManyAttempts(c: AppContext, retryAfterSec: number): Response {
  c.header('Retry-After', String(retryAfterSec));
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

// La ventana más larga en uso es de 1 h (descarga de respaldo): una entrada que empezó hace más
// de 25 h terminó hace más de 24 h y ya no cuenta para nada.
const STALE_AFTER_MS = 25 * 60 * 60 * 1000;

// Mantenimiento diario: borra las entradas de clientes que no han vuelto.
export function sweepRateLimits(kv: DurableObjectStorage['kv']): void {
  const cutoff = Date.now() - STALE_AFTER_MS;
  // Se juntan primero: borrar mientras se recorre el listado podría saltarse claves.
  const stale = [...kv.list<RateWindow>({ prefix: 'rl:' })]
    .filter(([, value]) => typeof value?.start !== 'number' || value.start < cutoff)
    .map(([key]) => key);
  for (const key of stale) kv.delete(key);
}

// El tope general (200 por minuto por IP) solo frena ráfagas: no hace falta que sobreviva a que el
// Durable Object se reinicie, y guardarlo en el kv era una escritura durable en cada petición, que
// retrasa la respuesta hasta confirmarse. Login, recuperación, respaldo y la consola siguen en el kv.
export class MemoryLimiter {
  private readonly windows = new Map<string, RateWindow>();

  constructor(private readonly maxKeys = 10_000) {}

  get size(): number {
    return this.windows.size;
  }

  hit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const stored = this.windows.get(key);
    const count = stored?.start === windowStart ? stored.count + 1 : 1;
    if (stored) {
      stored.start = windowStart;
      stored.count = count;
    } else {
      if (this.windows.size >= this.maxKeys) this.prune(windowStart);
      this.windows.set(key, { start: windowStart, count });
    }

    const allowed = count <= limit;
    return {
      allowed,
      retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)),
    };
  }

  // Primero las ventanas que ya terminaron; si no alcanza, las más viejas (la Map conserva el
  // orden de inserción), hasta el 90 % del tope: así no se recorre la Map en cada IP nueva.
  private prune(windowStart: number): void {
    const target = Math.floor(this.maxKeys * 0.9);
    for (const [key, value] of this.windows) {
      if (value.start < windowStart) this.windows.delete(key);
    }
    for (const key of this.windows.keys()) {
      if (this.windows.size <= target) break;
      this.windows.delete(key);
    }
  }
}

// Como rateLimit, pero con los contadores en memoria de la instancia (un limitador por app, es
// decir, por Durable Object).
export function memoryRateLimit(
  name: string,
  limit: number,
  windowMs: number,
  key: (c: AppContext) => string = clientIp,
): MiddlewareHandler<AppEnv> {
  const limiter = new MemoryLimiter();
  return async (c, next) => {
    const result = limiter.hit(`${name}:${key(c)}`, limit, windowMs);
    if (!result.allowed) return tooManyAttempts(c, result.retryAfterSec);
    await next();
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
    if (!result.allowed) return tooManyAttempts(c, result.retryAfterSec);
    await next();
  };
}
