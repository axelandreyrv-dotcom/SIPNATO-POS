import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { notes } from '../db/schema.js';
import { db } from '../db/client.js';
import type { Env } from '../env.js';
import { COOKIE_NAME } from '../lib/constants.js';
import worker from '../worker.js';
import {
  ADMIN_ORIGIN,
  call,
  createSuperadmin,
  createTestTenant,
  inTenant,
  loginToken,
  nextIp,
  platformCall,
  platformLogin,
  tenantUrl,
} from './helpers.js';

const SLUG = 'csrf';
const ORIGIN = tenantUrl(SLUG, '');
const PWD = 'clave-dueno-1';

const errorOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string; message: string } }).error;

const noteCount = () => inTenant(SLUG, () => db.select().from(notes).all().length);

// Como lo haría el navegador: la cookie viaja (mismo sitio) y el cuerpo es JSON, con el
// Content-Type y los headers de origen que se pidan.
function raw(
  path: string,
  init: { token: string; headers?: Record<string, string>; body?: string },
) {
  const headers = new Headers(init.headers);
  headers.set('Cookie', `${COOKIE_NAME}=${init.token}`);
  headers.set('CF-Connecting-IP', nextIp());
  return SELF.fetch(tenantUrl(SLUG, path), {
    method: 'POST',
    headers,
    ...(init.body !== undefined && { body: init.body }),
  });
}

const NOTE = JSON.stringify({ title: 'csrf', body: 'x' });

describe('protección CSRF de la API', () => {
  let token = '';

  beforeAll(async () => {
    await createTestTenant(SLUG, { owner: { username: 'dueno', password: PWD } });
    token = await loginToken(SLUG, 'dueno', PWD);
  });

  it('un cuerpo JSON con Content-Type text/plain → 415 y no se crea nada', async () => {
    const before = await noteCount();
    const res = await raw('/api/notes', {
      token,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: NOTE,
    });
    expect(res.status).toBe(415);
    expect((await errorOf(res)).code).toBe('TIPO_NO_SOPORTADO');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await noteCount()).toBe(before);

    const sinTipo = await raw('/api/notes', { token, body: NOTE });
    expect(sinTipo.status).toBe(415);
    expect(await noteCount()).toBe(before);
  });

  it('un Origin de otro subdominio → 403 ORIGEN_NO_PERMITIDO y no se crea nada', async () => {
    const before = await noteCount();
    for (const origin of [
      'https://otro.dosuxsoft.com',
      'https://www.dosuxsoft.com',
      `${ORIGIN}:8443`,
      'http://csrf.dosuxsoft.com.evil.com',
      'null',
    ]) {
      const res = await raw('/api/notes', {
        token,
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: NOTE,
      });
      expect(res.status, origin).toBe(403);
      expect((await errorOf(res)).code).toBe('ORIGEN_NO_PERMITIDO');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    }
    expect(await noteCount()).toBe(before);
  });

  it('Sec-Fetch-Site distinto de same-origin → 403', async () => {
    const before = await noteCount();
    for (const site of ['same-site', 'cross-site', 'none']) {
      const res = await raw('/api/notes', {
        token,
        headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': site },
        body: NOTE,
      });
      expect(res.status, site).toBe(403);
      expect((await errorOf(res)).code).toBe('ORIGEN_NO_PERMITIDO');
    }
    expect(await noteCount()).toBe(before);
  });

  it('la SPA (mismo origen, application/json) sí escribe', async () => {
    const before = await noteCount();
    const res = await raw('/api/notes', {
      token,
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'Sec-Fetch-Site': 'same-origin',
      },
      body: NOTE,
    });
    expect(res.status).toBe(201);
    expect(await noteCount()).toBe(before + 1);
  });

  it('un login con text/plain → 415 (no se puede iniciar sesión desde otro formulario)', async () => {
    const res = await SELF.fetch(tenantUrl(SLUG, '/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'CF-Connecting-IP': nextIp() },
      body: JSON.stringify({ username: 'dueno', password: PWD }),
    });
    expect(res.status).toBe(415);
  });

  it('cerrar sesión sin cuerpo desde el mismo origen funciona', async () => {
    const own = await loginToken(SLUG, 'dueno', PWD);
    const res = await raw('/auth/logout', {
      token: own,
      headers: { Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin' },
    });
    expect(res.status).toBe(200);
    expect((await call(SLUG, 'GET', '/auth/me', { token: own })).status).toBe(401);
  });

  it('GET no se revisa: una lectura con Origin ajeno sigue respondiendo', async () => {
    const res = await call(SLUG, 'GET', '/auth/me', {
      token,
      headers: { Origin: 'https://otro.dosuxsoft.com', 'Sec-Fetch-Site': 'same-site' },
    });
    expect(res.status).toBe(200);
  });
});

describe('protección CSRF del panel', () => {
  beforeAll(async () => {
    await createSuperadmin('csrf-root', PWD);
  });

  it('login del panel con text/plain → 415; con Origin de un negocio → 403', async () => {
    const plain = await SELF.fetch(`${ADMIN_ORIGIN}/platform/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'CF-Connecting-IP': nextIp() },
      body: JSON.stringify({ username: 'csrf-root', password: PWD }),
    });
    expect(plain.status).toBe(415);

    const foreign = await platformCall('POST', '/platform/auth/login', {
      body: { username: 'csrf-root', password: PWD },
      headers: { Origin: 'https://taller.dosuxsoft.com' },
    });
    expect(foreign.status).toBe(403);
    expect((await errorOf(foreign)).code).toBe('ORIGEN_NO_PERMITIDO');

    const own = await platformCall('POST', '/platform/auth/login', {
      body: { username: 'csrf-root', password: PWD },
      headers: { Origin: ADMIN_ORIGIN, 'Sec-Fetch-Site': 'same-origin' },
    });
    expect(own.status).toBe(200);
    expect((await platformLogin('csrf-root', PWD)).status).toBe(200);
  });
});

describe('en desarrollo (proxy de Vite)', () => {
  // El Worker usa el entorno de desarrollo; el host efectivo es el de X-Forwarded-Host.
  const dev = { ...env, ENVIRONMENT: 'development', TENANT_BASE_DOMAIN: 'localhost' } as Env;
  const devFetch = (headers: Record<string, string>) =>
    worker.fetch(
      new Request('http://localhost:8787/auth/logout', {
        method: 'POST',
        headers: { 'X-Forwarded-Host': `${SLUG}.localhost:5174`, ...headers },
      }) as Request<unknown, IncomingRequestCfProperties>,
      dev,
    );

  it('el Origin se compara con el host que vio el navegador', async () => {
    const own = await devFetch({ Origin: `http://${SLUG}.localhost:5174` });
    expect(own.status).not.toBe(403);
    const foreign = await devFetch({ Origin: 'http://otro.localhost:5174' });
    expect(foreign.status).toBe(403);
  });
});
