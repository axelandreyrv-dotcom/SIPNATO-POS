import { beforeAll, describe, expect, it } from 'vitest';
import { auditLog } from '../db/schema.js';
import { db } from '../db/client.js';
import { call, createTestTenant, inTenant, loginToken, type Method } from './helpers.js';

const PWD = 'clave-dueno-1';
const ADMIN_PWD = 'clave-admin-1';
const URL_PATH = '/api/settings/backup/download';

interface BackupJson {
  exportedAt: string;
  schemaVersion: string;
  tables: Record<string, Record<string, unknown>[]>;
}

async function setup(slug: string, description: string) {
  await createTestTenant(slug, { owner: { username: 'dueno', password: PWD } });
  const token = await loginToken(slug, 'dueno', PWD);
  const api = (method: Method, path: string, body?: unknown, t = token) =>
    call(slug, method, path, { token: t, body });
  expect((await api('POST', '/api/cash-registers/open', { openingAmount: 0 })).status).toBe(201);
  expect(
    (await api('POST', '/api/sales', { description, amount: 1500, paymentMethod: 'sinpe' })).status,
  ).toBe(201);
  return { token, api };
}

describe('respaldo en JSON', () => {
  let owner: Awaited<ReturnType<typeof setup>>;
  let adminToken = '';

  beforeAll(async () => {
    owner = await setup('resp-a', 'venta del negocio A');
    const created = await owner.api('POST', '/api/users', {
      username: 'beto',
      displayName: 'Beto',
      role: 'admin',
      secret: ADMIN_PWD,
    });
    expect(created.status).toBe(201);
    adminToken = await loginToken('resp-a', 'beto', ADMIN_PWD);
  });

  it('el dueño descarga el JSON con la venta creada y los encabezados de descarga', async () => {
    const res = await owner.api('GET', URL_PATH);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(
      new Date(),
    );
    expect(res.headers.get('Content-Disposition')).toBe(
      `attachment; filename="dosuxsoft-resp-a-${date}.json"`,
    );

    const body = (await res.json()) as BackupJson;
    expect(new Date(body.exportedAt).toISOString()).toBe(body.exportedAt);
    expect(body.schemaVersion).toMatch(/^0010_/);
    expect(body.tables['sales']?.map((s) => s['description'])).toEqual(['venta del negocio A']);
    expect(body.tables['sales']?.[0]?.['amount']).toBe(1500);
    expect(body.tables['users']?.map((u) => u['username'])).toEqual(
      expect.arrayContaining(['dueno', 'beto']),
    );
  });

  it('excluye las tablas internas y las sesiones', async () => {
    const body = (await (await owner.api('GET', URL_PATH)).json()) as BackupJson;
    const names = Object.keys(body.tables);
    expect(names).toContain('sales');
    expect(names).toContain('audit_log');
    expect(names.filter((n) => n === '__migrations' || /^(sqlite_|_cf_)/.test(n))).toEqual([]);
    // hashes de tokens de sesión: no sirven para restaurar y solo exponen
    expect(names).not.toContain('sessions');
  });

  it('queda registrada en el audit_log con quien descargó', async () => {
    await owner.api('GET', URL_PATH);
    const rows = await inTenant('resp-a', () =>
      db
        .select()
        .from(auditLog)
        .all()
        .filter((r) => r.action === 'BACKUP_DOWNLOADED'),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.userId !== null)).toBe(true);
  });

  it('un admin recibe 403 y sin sesión 401', async () => {
    const res = await call('resp-a', 'GET', URL_PATH, { token: adminToken });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN');
    expect((await call('resp-a', 'GET', URL_PATH)).status).toBe(401);
  });

  it('el JSON de un negocio nunca contiene filas de otro', async () => {
    const b = await setup('resp-b', 'venta del negocio B');
    const jsonB = JSON.stringify(await (await b.api('GET', URL_PATH)).json());
    const jsonA = JSON.stringify(await (await owner.api('GET', URL_PATH)).json());

    expect(jsonB).toContain('venta del negocio B');
    expect(jsonB).not.toContain('venta del negocio A');
    expect(jsonA).toContain('venta del negocio A');
    expect(jsonA).not.toContain('venta del negocio B');
  });

  it('el sexto intento en la hora es 429; otra sesión no comparte el límite', async () => {
    const c = await setup('resp-c', 'venta del negocio C');
    for (let i = 0; i < 5; i++) expect((await c.api('GET', URL_PATH)).status).toBe(200);

    const sexto = await c.api('GET', URL_PATH);
    expect(sexto.status).toBe(429);
    expect(Number(sexto.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(((await sexto.json()) as { error: { code: string } }).error.code).toBe(
      'DEMASIADOS_INTENTOS',
    );

    // la misma persona con otra sesión (otro token) cuenta aparte: el límite es por sesión
    const otraSesion = await loginToken('resp-c', 'dueno', PWD);
    expect((await c.api('GET', URL_PATH, undefined, otraSesion)).status).toBe(200);
  });
});
