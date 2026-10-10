import { runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hit } from '../lib/rate-limit.js';
import { tenantStub } from './helpers.js';

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
