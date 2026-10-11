import { runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { hit, MemoryLimiter } from '../lib/rate-limit.js';
import { call, createTestTenant, platformCall, platformStub, tenantStub } from './helpers.js';

const WINDOW = 60_000;
const T0 = Date.UTC(2026, 9, 10, 12, 0, 0);

const rateLimitKeys = (kv: SyncKvStorage) => [...kv.list({ prefix: 'rl:' })].map(([k]) => k);

describe('rate limit de ventana fija', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cuenta hasta el límite y luego bloquea con los segundos que faltan', async () => {
    const result = await runInDurableObject(tenantStub('rl-limite'), (_i, state) => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(T0 + 15_000);
      const hits = [1, 2, 3].map(() => hit(state.storage.kv, 'login:1.1.1.1', 2, WINDOW));
      now.mockReturnValue(T0 + WINDOW);
      const nextWindow = hit(state.storage.kv, 'login:1.1.1.1', 2, WINDOW);
      return { hits, nextWindow };
    });
    expect(result.hits).toEqual([
      { allowed: true, retryAfterSec: 0 },
      { allowed: true, retryAfterSec: 0 },
      { allowed: false, retryAfterSec: 45 },
    ]);
    expect(result.nextWindow, 'una ventana nueva reinicia el contador').toEqual({
      allowed: true,
      retryAfterSec: 0,
    });
  });

  it('un cliente que vuelve varias ventanas después reutiliza la misma clave', async () => {
    const keys = await runInDurableObject(tenantStub('rl-claves'), (_i, state) => {
      const kv = state.storage.kv;
      const now = vi.spyOn(Date, 'now');
      const seen: string[][] = [];
      for (const minutes of [0, 5, 60, 61]) {
        now.mockReturnValue(T0 + minutes * WINDOW);
        hit(kv, 'global:2.2.2.2', 200, WINDOW);
        hit(kv, 'global:3.3.3.3', 200, WINDOW);
        seen.push(rateLimitKeys(kv));
      }
      return seen;
    });
    for (const snapshot of keys) {
      expect(snapshot.sort()).toEqual(['rl:global:2.2.2.2', 'rl:global:3.3.3.3']);
    }
  });
});

describe('límite general (200 por minuto por IP) en memoria del Durable Object', () => {
  beforeAll(async () => {
    await createTestTenant('rl-global');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cuenta en memoria con ventana fija y el mismo resultado que el del kv', () => {
    const limiter = new MemoryLimiter(10);
    const now = vi.spyOn(Date, 'now').mockReturnValue(T0 + 15_000);
    const hits = [1, 2, 3].map(() => limiter.hit('global:1.1.1.1', 2, WINDOW));
    expect(hits).toEqual([
      { allowed: true, retryAfterSec: 0 },
      { allowed: true, retryAfterSec: 0 },
      { allowed: false, retryAfterSec: 45 },
    ]);
    now.mockReturnValue(T0 + WINDOW);
    expect(limiter.hit('global:1.1.1.1', 2, WINDOW)).toEqual({ allowed: true, retryAfterSec: 0 });
  });

  it('nunca guarda más claves que su tope', () => {
    const limiter = new MemoryLimiter(10);
    vi.spyOn(Date, 'now').mockReturnValue(T0);
    for (let i = 0; i < 50; i++) limiter.hit(`global:10.0.0.${i}`, 200, WINDOW);
    expect(limiter.size).toBeLessThanOrEqual(10);
  });

  const globalKeys = (state: DurableObjectState) =>
    [...state.storage.kv.list({ prefix: 'rl:global:' })].map(([k]) => k);

  it('negocio: la petición 201 en la misma ventana → 429, sin escribir el contador en el kv', async () => {
    // A mitad de una ventana: las 201 peticiones caen en la misma.
    vi.spyOn(Date, 'now').mockReturnValue(Math.floor(Date.now() / WINDOW) * WINDOW + 1_000);
    const ip = '198.51.100.20';
    for (let i = 0; i < 200; i++) {
      const res = await call('rl-global', 'GET', '/auth/status', { ip });
      expect(res.status).toBe(200);
      await res.text();
    }
    const blocked = await call('rl-global', 'GET', '/auth/status', { ip });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await blocked.json()).toEqual({
      error: {
        code: 'DEMASIADOS_INTENTOS',
        message: 'Demasiados intentos. Espera un momento antes de volver a intentarlo.',
      },
    });
    const other = await call('rl-global', 'GET', '/auth/status', { ip: '198.51.100.21' });
    expect(other.status).toBe(200);
    await other.text();
    expect(await runInDurableObject(tenantStub('rl-global'), (_i, s) => globalKeys(s))).toEqual([]);
  }, 30_000);

  it('plataforma: tampoco escribe el contador general en el kv', async () => {
    const res = await platformCall('GET', '/health', { ip: '198.51.100.30' });
    expect(res.status).toBe(200);
    await res.text();
    expect(await runInDurableObject(platformStub(), (_i, s) => globalKeys(s))).toEqual([]);
  });
});
