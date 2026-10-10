import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { auditLog, businessProfile } from '../db/schema.js';
import { db } from '../db/client.js';
import {
  call,
  createTestTenant,
  inTenant,
  login,
  loginToken,
  sessionCookie,
  tenantStub,
  tenantUrl,
} from './helpers.js';

const SLUG = 'http';
const PWD = 'clave-dueno-1';

const errorOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string; message: string } }).error;

describe('capa HTTP del negocio', () => {
  let token = '';

  beforeAll(async () => {
    await createTestTenant(SLUG, { owner: { username: 'dueno', password: PWD } });
    token = await loginToken(SLUG, 'dueno', PWD);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('login 6 veces desde la misma IP → el sexto es 429 con Retry-After', async () => {
    const ip = '203.0.113.7';
    for (let i = 0; i < 5; i++) expect((await login(SLUG, 'fantasma', 'x', ip)).status).toBe(401);

    const sexto = await login(SLUG, 'fantasma', 'x', ip);
    expect(sexto.status).toBe(429);
    const retryAfter = Number(sexto.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    expect((await errorOf(sexto)).code).toBe('DEMASIADOS_INTENTOS');

    expect((await login(SLUG, 'dueno', PWD, '203.0.113.8')).status, 'otra IP sigue').toBe(200);
  });

  it('la cookie de sesión no lleva Domain y lleva Secure, HttpOnly, SameSite=Strict', async () => {
    const cookie = sessionCookie(await login(SLUG, 'dueno', PWD))!;
    expect(cookie).toBeTruthy();
    const attrs = cookie.split(';').map((a) => a.trim().toLowerCase());
    expect(attrs).toEqual(
      expect.arrayContaining(['secure', 'httponly', 'samesite=strict', 'path=/', 'max-age=28800']),
    );
    expect(attrs.some((a) => a.startsWith('domain'))).toBe(false);
  });

  it('error interno responde { error: { code: "ERROR_INTERNO" } } sin stack', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = await inTenant(SLUG, () =>
      db.select({ modules: businessProfile.modules }).from(businessProfile).get(),
    );
    await inTenant(SLUG, () => db.update(businessProfile).set({ modules: '{roto' }).run());
    try {
      const res = await call(SLUG, 'GET', '/api/business', { token });
      expect(res.status).toBe(500);
      const body = (await res.json()) as Record<string, unknown>;
      expect(Object.keys(body)).toEqual(['error']);
      expect(body['error']).toEqual({ code: 'ERROR_INTERNO', message: expect.any(String) });
      expect(JSON.stringify(body)).not.toMatch(/JSON|at |\.ts/);
      expect(logged).toHaveBeenCalled();
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    } finally {
      await inTenant(SLUG, () =>
        db.update(businessProfile).set({ modules: original!.modules }).run(),
      );
    }
  });

  it('un perfil guardado que no cumple el esquema es un error interno, no de validación', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = await inTenant(SLUG, () =>
      db.select({ modules: businessProfile.modules }).from(businessProfile).get(),
    );
    await inTenant(SLUG, () => db.update(businessProfile).set({ modules: '["x"]' }).run());
    try {
      // /api/business lee el perfil tras la sesión; /api/boletas, en la guarda del módulo, antes.
      for (const res of [
        await call(SLUG, 'GET', '/api/business', { token }),
        await call(SLUG, 'GET', '/api/boletas'),
      ]) {
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body).toEqual({
          error: { code: 'ERROR_INTERNO', message: 'Error interno del servidor' },
        });
        expect(JSON.stringify(body)).not.toMatch(/enum|Expected|received|invalid/i);
      }
      expect(logged).toHaveBeenCalledTimes(2);
    } finally {
      await inTenant(SLUG, () =>
        db.update(businessProfile).set({ modules: original!.modules }).run(),
      );
    }
  });

  it('toda respuesta de /api lleva Cache-Control: no-store', async () => {
    const responses = [
      await call(SLUG, 'GET', '/api/business', { token }),
      await call(SLUG, 'GET', '/api/business'),
      await call(SLUG, 'GET', '/api/no-existe', { token }),
      await call(SLUG, 'POST', '/api/notes', { token, body: { title: 1 } }),
    ];
    expect(responses.map((r) => r.status)).toEqual([200, 401, 404, 400]);
    for (const res of responses) {
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    }
  });

  it('un cuerpo de más de 1 MB se rechaza con 413', async () => {
    const res = await call(SLUG, 'POST', '/api/notes', {
      token,
      body: { title: 'x', body: 'a'.repeat(1024 * 1024) },
    });
    expect(res.status).toBe(413);
    expect((await errorOf(res)).code).toBe('CUERPO_DEMASIADO_GRANDE');
  });

  it('una ruta inexistente responde 404 NO_ENCONTRADO en JSON', async () => {
    const res = await call(SLUG, 'GET', '/api/no-existe', { token });
    expect((await errorOf(res)).code).toBe('NO_ENCONTRADO');
  });

  it('sin sesión: 401 UNAUTHORIZED; con una cookie inválida: SESSION_EXPIRED y la borra', async () => {
    expect((await errorOf(await call(SLUG, 'GET', '/auth/me'))).code).toBe('UNAUTHORIZED');
    const res = await call(SLUG, 'GET', '/auth/me', { token: 'no-existe' });
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe('SESSION_EXPIRED');
    expect(sessionCookie(res)).toMatch(/Max-Age=0/);
  });
});

describe('Durable Object del negocio', () => {
  it('un negocio nunca inicializado responde 404 NEGOCIO_NO_ENCONTRADO', async () => {
    const res = await call('nunca-creado', 'GET', '/auth/status');
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe('NEGOCIO_NO_ENCONTRADO');
  });

  it('si el slug del header interno no coincide con el del DO responde 404', async () => {
    await createTestTenant('http-a');
    const stub = tenantStub('http-a');
    const res = await stub.fetch(
      new Request(tenantUrl('http-b', '/auth/status'), {
        headers: { 'X-Dosuxsoft-Tenant': 'http-b' },
      }),
    );
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe('NEGOCIO_NO_ENCONTRADO');

    const ok = await stub.fetch(
      new Request(tenantUrl('http-a', '/auth/status'), {
        headers: { 'X-Dosuxsoft-Tenant': 'http-a' },
      }),
    );
    expect(ok.status).toBe(200);
  });

  it('initialize por RPC es idempotente: repetir la misma asignación no cambia nada', async () => {
    const assignment = { template: 'tienda' as const, modules: ['apartados' as const] };
    await tenantStub('http-c').initialize('http-c', assignment);
    const snapshot = () =>
      inTenant('http-c', () => ({
        profile: db.select().from(businessProfile).get(),
        audit: db.select().from(auditLog).all(),
      }));
    const before = await snapshot();
    expect(before.profile?.template).toBe('tienda');

    await tenantStub('http-c').initialize('http-c', assignment);
    expect(await snapshot()).toEqual(before);
  });

  it('initialize por RPC rechaza otro slug y el DO sigue siendo del primero', async () => {
    await createTestTenant('http-d');
    let error: unknown = null;
    try {
      await tenantStub('http-d').initialize('otro', { template: 'tienda', modules: [] });
    } catch (e) {
      error = e;
    }
    expect(String(error)).toMatch(/ya pertenece al negocio "http-d"/);
    expect((await call('http-d', 'GET', '/auth/status')).status).toBe(200);
  });

  it('resetOwner da una contraseña temporal, desbloquea al dueño y cierra sus sesiones', async () => {
    await createTestTenant('http-e', { owner: { username: 'dueno', password: PWD } });
    const old = await loginToken('http-e', 'dueno', PWD);

    const reset = await tenantStub('http-e').resetOwner();
    expect(reset.username).toBe('dueno');
    expect(reset.tempPassword).toHaveLength(12);
    expect(reset.recoveryCode).toMatch(/^[0-9a-f]{32}$/);

    expect((await call('http-e', 'GET', '/auth/me', { token: old })).status).toBe(401);
    expect((await login('http-e', 'dueno', PWD)).status).toBe(401);
    expect((await login('http-e', 'dueno', reset.tempPassword)).status).toBe(200);
    const audit = await inTenant('http-e', () =>
      db.select({ action: auditLog.action }).from(auditLog).all(),
    );
    expect(audit.map((a) => a.action)).toContain('BREAK_GLASS_RESET');
  });
});
