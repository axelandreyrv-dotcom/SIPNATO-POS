import { desc, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db/client.js';
import { auditLog } from '../db/schema.js';
import { call, createTestTenant, inTenant, login, loginToken, type Method } from './helpers.js';

const SLUG = 'usuarios';
const OWNER_PWD = 'clave-del-dueno';
const ADMIN_PWD = 'clave-del-admin';
const CAJERO_PIN = '123456';

describe('usuarios, roles y permisos', () => {
  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  let recoveryCode = '';

  const api = (who: string | null, method: Method, url: string, body?: object) =>
    call(SLUG, method, url, { token: who ? tokens[who] : undefined, body });

  const lastAudit = (action: string) =>
    inTenant(SLUG, () =>
      db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, action))
        .orderBy(desc(auditLog.id))
        .get(),
    );

  beforeAll(async () => {
    const created = await createTestTenant(SLUG, {
      owner: { username: 'ana', displayName: 'Ana Dueña', password: OWNER_PWD },
    });
    recoveryCode = created.recoveryCode!;
    tokens['dueno'] = await loginToken(SLUG, 'Ana', OWNER_PWD);
  });

  it('el dueño entra (usuario normalizado a minúsculas)', async () => {
    const me = (await (await api('dueno', 'GET', '/auth/me')).json()) as {
      user: { role: string; username: string };
    };
    expect(me.user.role).toBe('dueno');
    expect(me.user.username).toBe('ana');
  });

  it('el dueño crea un admin con contraseña y un cajero con PIN', async () => {
    const admin = await api('dueno', 'POST', '/api/users', {
      username: 'beto',
      displayName: 'Beto',
      role: 'admin',
      secret: ADMIN_PWD,
    });
    expect(admin.status).toBe(201);
    ids['admin'] = ((await admin.json()) as { id: number }).id;

    const cajeroConClave = await api('dueno', 'POST', '/api/users', {
      username: 'caro',
      displayName: 'Caro',
      role: 'cajero',
      secret: 'no-es-un-pin',
    });
    expect(cajeroConClave.status, 'un cajero exige PIN de 6 dígitos').toBe(400);

    const cajero = await api('dueno', 'POST', '/api/users', {
      username: 'caro',
      displayName: 'Caro',
      role: 'cajero',
      secret: CAJERO_PIN,
    });
    expect(cajero.status).toBe(201);
    ids['cajero'] = ((await cajero.json()) as { id: number }).id;

    const repetido = await api('dueno', 'POST', '/api/users', {
      username: 'caro',
      displayName: 'Otra',
      role: 'cajero',
      secret: '654321',
    });
    expect(repetido.status).toBe(409);
  });

  it('nadie puede crear otro dueño', async () => {
    const res = await api('dueno', 'POST', '/api/users', {
      username: 'otro',
      displayName: 'Otro',
      role: 'dueno',
      secret: OWNER_PWD,
    });
    expect(res.status).toBe(400);
  });

  it('el admin gestiona cajeros pero no admins ni al dueño', async () => {
    tokens['admin'] = await loginToken(SLUG, 'beto', ADMIN_PWD);
    const crearAdmin = await api('admin', 'POST', '/api/users', {
      username: 'dani',
      displayName: 'Dani',
      role: 'admin',
      secret: ADMIN_PWD,
    });
    expect(crearAdmin.status).toBe(403);

    const crearCajero = await api('admin', 'POST', '/api/users', {
      username: 'eli',
      displayName: 'Eli',
      role: 'cajero',
      secret: '111111',
    });
    expect(crearCajero.status).toBe(201);
    ids['cajero2'] = ((await crearCajero.json()) as { id: number }).id;

    const users = (await (await api('admin', 'GET', '/api/users')).json()) as {
      id: number;
      role: string;
    }[];
    const dueno = users.find((u) => u.role === 'dueno')!;
    const tocarDueno = await api('admin', 'PATCH', `/api/users/${dueno.id}`, { active: false });
    expect(tocarDueno.status).toBe(403);

    const tocarseASiMismo = await api('admin', 'PATCH', `/api/users/${ids['admin']}`, {
      displayName: 'X',
    });
    expect(tocarseASiMismo.status).toBe(403);
  });

  it('el cajero entra con PIN y no gestiona usuarios, configuración ni backups', async () => {
    tokens['cajero'] = await loginToken(SLUG, 'caro', CAJERO_PIN);
    expect((await api('cajero', 'GET', '/api/users')).status).toBe(403);
    expect(
      (await api('cajero', 'GET', '/api/settings')).status,
      'los tickets necesitan los datos del negocio',
    ).toBe(200);
    expect((await api('cajero', 'PUT', '/api/settings', {})).status).toBe(403);
    expect((await api('cajero', 'GET', '/api/settings/backup/download')).status).toBe(403);
    expect(
      (await api('admin', 'GET', '/api/settings/backup/download')).status,
      'backups: solo el dueño',
    ).toBe(403);
  });

  it('el cajero no cancela créditos ni anula facturas; el admin sí puede intentarlo', async () => {
    // (Apartados viene desactivado en la plantilla genérica: respondería 404 MODULO_DESACTIVADO.)
    expect((await api('cajero', 'POST', '/api/creditos/999/cancel')).status).toBe(403);
    expect((await api('cajero', 'POST', '/api/facturas/999/anular')).status).toBe(403);
    expect((await api('admin', 'POST', '/api/creditos/999/cancel')).status).toBe(404);
  });

  it('las acciones quedan en la bitácora con su autor', async () => {
    expect(
      (await api('cajero', 'POST', '/api/cash-registers/open', { openingAmount: 0 })).status,
    ).toBe(201);
    const sale = await api('cajero', 'POST', '/api/sales', {
      amount: 5000,
      paymentMethod: 'efectivo',
    });
    expect(sale.status).toBe(201);
    ids['sale'] = ((await sale.json()) as { id: number }).id;
    expect((await lastAudit('SALE_CREATED'))?.userId).toBe(ids['cajero']);
  });

  it('el cajero elimina una venta solo con autorización de un admin o dueño', async () => {
    const url = `/api/sales/${ids['sale']}`;
    const errorCode = async (res: Response) =>
      ((await res.json()) as { error: { code: string } }).error.code;

    const sinAutorizacion = await api('cajero', 'DELETE', url, {});
    expect(sinAutorizacion.status).toBe(403);
    expect(await errorCode(sinAutorizacion)).toBe('AUTORIZACION_REQUERIDA');

    const autorizadoPorCajero = await api('cajero', 'DELETE', url, {
      authorization: { username: 'eli', secret: '111111' },
    });
    expect(await errorCode(autorizadoPorCajero), 'otro cajero no puede autorizar').toBe(
      'AUTORIZACION_INVALIDA',
    );

    const claveMala = await api('cajero', 'DELETE', url, {
      authorization: { username: 'beto', secret: 'incorrecta' },
    });
    expect(await errorCode(claveMala)).toBe('AUTORIZACION_INVALIDA');

    const autorizado = await api('cajero', 'DELETE', url, {
      authorization: { username: 'beto', secret: ADMIN_PWD },
    });
    expect(autorizado.status).toBe(200);

    const entry = (await lastAudit('SALE_DELETED'))!;
    expect(entry.userId).toBe(ids['cajero']);
    expect(JSON.parse(entry.payloadSnapshot!).authorizedBy.username).toBe('beto');

    const failed = (await lastAudit('SUPERVISOR_AUTH_FAILED'))!;
    expect(failed.userId, 'el intento fallido queda a nombre de quien pidió la autorización').toBe(
      ids['cajero'],
    );
  });

  it('el admin elimina directo, sin pedir autorización', async () => {
    const sale = await api('cajero', 'POST', '/api/sales', {
      amount: 1000,
      paymentMethod: 'sinpe',
    });
    const { id } = (await sale.json()) as { id: number };
    expect((await api('admin', 'DELETE', `/api/sales/${id}`, {})).status).toBe(200);
  });

  it('5 intentos fallidos bloquean al usuario; el admin lo desbloquea', async () => {
    for (let i = 0; i < 4; i++) expect((await login(SLUG, 'eli', '000000')).status).toBe(401);
    expect((await login(SLUG, 'eli', '000000')).status, 'el quinto fallo bloquea').toBe(429);
    expect((await login(SLUG, 'eli', '111111')).status, 'bloqueado aun con el PIN correcto').toBe(
      429,
    );

    const lista = (await (await api('admin', 'GET', '/api/users')).json()) as {
      username: string;
      locked: boolean;
    }[];
    expect(lista.find((u) => u.username === 'eli')!.locked).toBe(true);

    expect(
      (await api('admin', 'PATCH', `/api/users/${ids['cajero2']}`, { unlock: true })).status,
    ).toBe(200);
    expect((await login(SLUG, 'eli', '111111')).status).toBe(200);
  });

  it('un usuario inexistente responde igual que una contraseña incorrecta', async () => {
    const res = await login(SLUG, 'fantasma', 'loquesea');
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'INVALID_CREDENTIALS',
    );
  });

  it('cambiar el propio PIN cierra las sesiones abiertas', async () => {
    const res = await api('cajero', 'POST', '/api/users/me/secret', {
      currentSecret: CAJERO_PIN,
      newSecret: '222222',
    });
    expect(res.status).toBe(200);
    expect((await api('cajero', 'GET', '/auth/me')).status).toBe(401);
    tokens['cajero'] = await loginToken(SLUG, 'caro', '222222');
  });

  it('desactivar a un cajero cierra su sesión y le impide entrar', async () => {
    expect(
      (await api('admin', 'PATCH', `/api/users/${ids['cajero']}`, { active: false })).status,
    ).toBe(200);
    expect((await api('cajero', 'GET', '/auth/me')).status).toBe(401);
    expect((await login(SLUG, 'caro', '222222')).status).toBe(401);
  });

  it('el recovery code restablece al dueño y le recuerda su usuario', async () => {
    const recover = (code: string) =>
      call(SLUG, 'POST', '/auth/recover', {
        body: { recoveryCode: code, newPassword: 'nueva-clave-123' },
      });
    expect((await recover('codigo-falso')).status).toBe(401);

    const res = await recover(recoveryCode);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { username: string }).username).toBe('ana');
    expect(
      (await api('dueno', 'GET', '/auth/me')).status,
      'las sesiones anteriores se cierran',
    ).toBe(401);
    expect((await login(SLUG, 'ana', 'nueva-clave-123')).status).toBe(200);
  });

  it('logout revoca la sesión y borra la cookie', async () => {
    const token = await loginToken(SLUG, 'beto', ADMIN_PWD);
    const res = await call(SLUG, 'POST', '/auth/logout', { token });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join()).toMatch(/sipnato_session=;.*Max-Age=0/);
    expect((await call(SLUG, 'GET', '/auth/me', { token })).status).toBe(401);
  });

  it('sin un código emitido por la plataforma el setup queda cerrado', async () => {
    const res = await call('usuarios-sin-dueno', 'GET', '/auth/status');
    expect(res.status, 'un negocio sin inicializar no existe').toBe(404);

    await createTestTenant('usuarios-sin-dueno');
    expect(await (await call('usuarios-sin-dueno', 'GET', '/auth/status')).json()).toEqual({
      setup: false,
    });
    const setup = await call('usuarios-sin-dueno', 'POST', '/auth/setup', {
      body: {
        setupCode: 'AAAA-BBBB-CCCC-DDDD',
        username: 'ana',
        displayName: 'Ana',
        password: OWNER_PWD,
        confirmPassword: OWNER_PWD,
      },
    });
    expect(setup.status).toBe(403);
    expect(((await setup.json()) as { error: { code: string } }).error.code).toBe(
      'SETUP_CODE_INVALID',
    );
    expect(await (await call('usuarios-sin-dueno', 'GET', '/auth/status')).json()).toEqual({
      setup: false,
    });
  });
});
