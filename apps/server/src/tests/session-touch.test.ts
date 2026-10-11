import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db/client.js';
import { controlDb } from '../db/control.js';
import { sessions } from '../db/schema.js';
import { hashSessionToken } from '../lib/crypto.js';
import {
  call,
  createSuperadmin,
  createTestTenant,
  inPlatform,
  inTenant,
  loginToken,
  platformCall,
  platformLogin,
  platformToken,
} from './helpers.js';

const SLUG = 'toque';
const PWD = 'clave-dueno-1';
const SECOND = 1000;
const MINUTE = 60 * SECOND;

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe('última actividad de la sesión: a lo sumo una escritura por minuto', () => {
  let token = '';
  let tokenHash = '';

  beforeAll(async () => {
    await createTestTenant(SLUG, { owner: { username: 'dueno', password: PWD } });
    token = await loginToken(SLUG, 'dueno', PWD);
    tokenHash = await hashSessionToken(token);
  });

  const lastActive = () =>
    inTenant(
      SLUG,
      () =>
        db
          .select({ at: sessions.lastActiveAt })
          .from(sessions)
          .where(eq(sessions.tokenHash, tokenHash))
          .get()!.at,
    );
  const setLastActive = (at: string) =>
    inTenant(SLUG, () =>
      db.update(sessions).set({ lastActiveAt: at }).where(eq(sessions.tokenHash, tokenHash)).run(),
    );
  const me = async () => {
    const res = await call(SLUG, 'GET', '/auth/me', { token });
    await res.text();
    return res.status;
  };

  it('dos peticiones seguidas no vuelven a escribirla', async () => {
    const recent = ago(10 * SECOND);
    await setLastActive(recent);
    expect(await me()).toBe(200);
    expect(await me()).toBe(200);
    expect(await lastActive()).toBe(recent);
  });

  it('con más de 60 s se actualiza', async () => {
    await setLastActive(ago(61 * SECOND));
    expect(await me()).toBe(200);
    expect(new Date(await lastActive()).getTime()).toBeGreaterThan(Date.now() - 10 * SECOND);
  });

  it('el límite de 60 min de inactividad no cambia', async () => {
    await setLastActive(ago(59 * MINUTE));
    expect(await me()).toBe(200);
    await setLastActive(ago(61 * MINUTE));
    expect(await me()).toBe(401);
  });
});

describe('sesión del panel: a lo sumo una escritura por minuto', () => {
  let token = '';

  beforeAll(async () => {
    await createSuperadmin('toque', 'clave-panel-123');
    const res = await platformLogin('toque', 'clave-panel-123');
    token = platformToken(res)!;
    await res.text();
  });

  const lastActive = async () => {
    const hash = await hashSessionToken(token);
    return inPlatform(
      () =>
        controlDb
          .prepare<
            [string],
            { last_active_at: string }
          >('SELECT last_active_at FROM platform_sessions WHERE token_hash = ?')
          .get(hash)!.last_active_at,
    );
  };
  const setLastActive = async (at: string) => {
    const hash = await hashSessionToken(token);
    await inPlatform(() =>
      controlDb
        .prepare('UPDATE platform_sessions SET last_active_at = ? WHERE token_hash = ?')
        .run(at, hash),
    );
  };
  const me = async () => {
    const res = await platformCall('GET', '/platform/auth/me', { token });
    await res.text();
    return res.status;
  };

  it('dos peticiones seguidas no vuelven a escribirla; con más de 60 s sí', async () => {
    const recent = ago(10 * SECOND);
    await setLastActive(recent);
    expect(await me()).toBe(200);
    expect(await me()).toBe(200);
    expect(await lastActive()).toBe(recent);

    await setLastActive(ago(61 * SECOND));
    expect(await me()).toBe(200);
    expect(new Date(await lastActive()).getTime()).toBeGreaterThan(Date.now() - 10 * SECOND);
  });
});
