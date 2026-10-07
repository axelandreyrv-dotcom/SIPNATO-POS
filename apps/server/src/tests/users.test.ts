import { strict as assert } from 'assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// config.ts lee process.env al importarse: el entorno debe fijarse antes de cargar la app.
const dataDir = mkdtempSync(join(tmpdir(), 'dosuxsoft-users-'));
process.env['DATA_DIR'] = dataDir;
process.env['TENANT_BASE_DOMAIN'] = 'dosuxsoft.test';
process.env['NODE_ENV'] = 'development';

const { buildApp } = await import('../app.js');
const { closeAllTenantDbs, db, runWithTenant } = await import('../db/client.js');
const { closeControlDb, insertTenant, setSetupCodeHash } = await import('../db/control.js');
const { auditLog } = await import('../db/schema.js');
const { COOKIE_NAME } = await import('../lib/constants.js');
const { generateSetupCode, hashSetupCode } = await import('../lib/crypto.js');
const { desc, eq } = await import('drizzle-orm');

type App = Awaited<ReturnType<typeof buildApp>>;

const SLUG = 'tienda';
const HOST = `${SLUG}.dosuxsoft.test`;
const OWNER_PWD = 'clave-del-dueno';
const ADMIN_PWD = 'clave-del-admin';
const CAJERO_PIN = '123456';

// IP distinta por request de login: el rate limit por IP (5/15 min) no debe tapar el bloqueo por usuario.
let ipCounter = 0;
const nextIp = () => `10.0.0.${++ipCounter}`;

describe('usuarios, roles y permisos', () => {
  let app: App;
  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  let recoveryCode = '';

  const call = (
    who: string | null,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) =>
    app.inject({
      method,
      url,
      headers: { host: HOST, ...(who ? { cookie: `${COOKIE_NAME}=${tokens[who]}` } : {}) },
      ...(payload ? { payload } : {}),
    });

  async function login(username: string, password: string) {
    return app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { host: HOST },
      remoteAddress: nextIp(),
      payload: { username, password },
    });
  }

  async function loginAs(key: string, username: string, password: string) {
    const res = await login(username, password);
    assert.equal(res.statusCode, 200, res.body);
    tokens[key] = res.cookies.find((c) => c.name === COOKIE_NAME)!.value;
  }

  const lastAudit = (action: string) =>
    runWithTenant(SLUG, () =>
      db.select().from(auditLog).where(eq(auditLog.action, action)).orderBy(desc(auditLog.id)).get(),
    );

  before(async () => {
    insertTenant(SLUG, 'Tienda');
    const code = generateSetupCode();
    setSetupCodeHash(SLUG, await hashSetupCode(code));
    app = await buildApp({ startJobs: false });

    const setup = await call(null, 'POST', '/auth/setup', {
      setupCode: code, username: 'Ana', displayName: 'Ana Dueña', password: OWNER_PWD, confirmPassword: OWNER_PWD,
    });
    assert.equal(setup.statusCode, 201, setup.body);
    tokens['dueno'] = setup.cookies.find((c) => c.name === COOKIE_NAME)!.value;
    recoveryCode = setup.json().recoveryCode;
  });

  after(async () => {
    await app.close();
    closeAllTenantDbs();
    closeControlDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('el setup crea al dueño (usuario normalizado a minúsculas)', async () => {
    const me = await call('dueno', 'GET', '/auth/me');
    assert.equal(me.json().user.role, 'dueno');
    assert.equal(me.json().user.username, 'ana');
  });

  it('el dueño crea un admin con contraseña y un cajero con PIN', async () => {
    const admin = await call('dueno', 'POST', '/api/users', {
      username: 'beto', displayName: 'Beto', role: 'admin', secret: ADMIN_PWD,
    });
    assert.equal(admin.statusCode, 201, admin.body);
    ids['admin'] = admin.json().id;

    const cajeroConClave = await call('dueno', 'POST', '/api/users', {
      username: 'caro', displayName: 'Caro', role: 'cajero', secret: 'no-es-un-pin',
    });
    assert.equal(cajeroConClave.statusCode, 400, 'un cajero exige PIN de 6 dígitos');

    const cajero = await call('dueno', 'POST', '/api/users', {
      username: 'caro', displayName: 'Caro', role: 'cajero', secret: CAJERO_PIN,
    });
    assert.equal(cajero.statusCode, 201, cajero.body);
    ids['cajero'] = cajero.json().id;

    const repetido = await call('dueno', 'POST', '/api/users', {
      username: 'caro', displayName: 'Otra', role: 'cajero', secret: '654321',
    });
    assert.equal(repetido.statusCode, 409);
  });

  it('nadie puede crear otro dueño', async () => {
    const res = await call('dueno', 'POST', '/api/users', {
      username: 'otro', displayName: 'Otro', role: 'dueno', secret: OWNER_PWD,
    });
    assert.equal(res.statusCode, 400);
  });

  it('el admin gestiona cajeros pero no admins ni al dueño', async () => {
    await loginAs('admin', 'beto', ADMIN_PWD);
    const crearAdmin = await call('admin', 'POST', '/api/users', {
      username: 'dani', displayName: 'Dani', role: 'admin', secret: ADMIN_PWD,
    });
    assert.equal(crearAdmin.statusCode, 403);

    const crearCajero = await call('admin', 'POST', '/api/users', {
      username: 'eli', displayName: 'Eli', role: 'cajero', secret: '111111',
    });
    assert.equal(crearCajero.statusCode, 201);
    ids['cajero2'] = crearCajero.json().id;

    const dueno = (await call('admin', 'GET', '/api/users')).json().find((u: { role: string }) => u.role === 'dueno');
    const tocarDueno = await call('admin', 'PATCH', `/api/users/${dueno.id}`, { active: false });
    assert.equal(tocarDueno.statusCode, 403);

    const tocarseASiMismo = await call('admin', 'PATCH', `/api/users/${ids['admin']}`, { displayName: 'X' });
    assert.equal(tocarseASiMismo.statusCode, 403);
  });

  it('el cajero entra con PIN y no gestiona usuarios, configuración ni backups', async () => {
    await loginAs('cajero', 'caro', CAJERO_PIN);
    assert.equal((await call('cajero', 'GET', '/api/users')).statusCode, 403);
    assert.equal((await call('cajero', 'GET', '/api/settings')).statusCode, 200, 'los tickets necesitan los datos del negocio');
    assert.equal((await call('cajero', 'PUT', '/api/settings', {})).statusCode, 403);
    assert.equal((await call('cajero', 'GET', '/api/settings/backup/download')).statusCode, 403);
    assert.equal((await call('admin', 'GET', '/api/settings/backup/download')).statusCode, 403, 'backups: solo el dueño');
  });

  it('el cajero no cancela créditos ni apartados; el admin sí puede intentarlo', async () => {
    assert.equal((await call('cajero', 'POST', '/api/creditos/999/cancel')).statusCode, 403);
    assert.equal((await call('cajero', 'POST', '/api/apartados/999/cancel')).statusCode, 403);
    assert.equal((await call('admin', 'POST', '/api/creditos/999/cancel')).statusCode, 404);
  });

  it('las acciones quedan en la bitácora con su autor', async () => {
    assert.equal((await call('cajero', 'POST', '/api/cash-registers/open', { openingAmount: 0 })).statusCode, 201);
    const sale = await call('cajero', 'POST', '/api/sales', { amount: 5000, paymentMethod: 'efectivo' });
    assert.equal(sale.statusCode, 201, sale.body);
    ids['sale'] = sale.json().id;
    assert.equal(lastAudit('SALE_CREATED')?.userId, ids['cajero']);
  });

  it('el cajero elimina una venta solo con autorización de un admin o dueño', async () => {
    const url = `/api/sales/${ids['sale']}`;

    const sinAutorizacion = await call('cajero', 'DELETE', url, {});
    assert.equal(sinAutorizacion.statusCode, 403);
    assert.equal(sinAutorizacion.json().error.code, 'AUTORIZACION_REQUERIDA');

    const autorizadoPorCajero = await call('cajero', 'DELETE', url, {
      authorization: { username: 'eli', secret: '111111' },
    });
    assert.equal(autorizadoPorCajero.json().error.code, 'AUTORIZACION_INVALIDA', 'otro cajero no puede autorizar');

    const claveMala = await call('cajero', 'DELETE', url, {
      authorization: { username: 'beto', secret: 'incorrecta' },
    });
    assert.equal(claveMala.json().error.code, 'AUTORIZACION_INVALIDA');

    const autorizado = await call('cajero', 'DELETE', url, {
      authorization: { username: 'beto', secret: ADMIN_PWD },
    });
    assert.equal(autorizado.statusCode, 200, autorizado.body);

    const entry = lastAudit('SALE_DELETED')!;
    assert.equal(entry.userId, ids['cajero']);
    assert.equal(JSON.parse(entry.payloadSnapshot!).authorizedBy.username, 'beto');

    const failed = lastAudit('SUPERVISOR_AUTH_FAILED')!;
    assert.equal(failed.userId, ids['cajero'], 'el intento fallido queda a nombre de quien pidió la autorización');
  });

  it('el admin elimina directo, sin pedir autorización', async () => {
    const sale = await call('cajero', 'POST', '/api/sales', { amount: 1000, paymentMethod: 'sinpe' });
    assert.equal((await call('admin', 'DELETE', `/api/sales/${sale.json().id}`, {})).statusCode, 200);
  });

  it('5 intentos fallidos bloquean al usuario; el admin lo desbloquea', async () => {
    for (let i = 0; i < 4; i++) assert.equal((await login('eli', '000000')).statusCode, 401);
    assert.equal((await login('eli', '000000')).statusCode, 429, 'el quinto fallo bloquea');
    assert.equal((await login('eli', '111111')).statusCode, 429, 'bloqueado aun con el PIN correcto');

    const lista = (await call('admin', 'GET', '/api/users')).json();
    assert.equal(lista.find((u: { username: string }) => u.username === 'eli').locked, true);

    assert.equal((await call('admin', 'PATCH', `/api/users/${ids['cajero2']}`, { unlock: true })).statusCode, 200);
    assert.equal((await login('eli', '111111')).statusCode, 200);
  });

  it('un usuario inexistente responde igual que una contraseña incorrecta', async () => {
    const res = await login('fantasma', 'loquesea');
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error.code, 'INVALID_CREDENTIALS');
  });

  it('cambiar el propio PIN cierra las sesiones abiertas', async () => {
    const res = await call('cajero', 'POST', '/api/users/me/secret', { currentSecret: CAJERO_PIN, newSecret: '222222' });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await call('cajero', 'GET', '/auth/me')).statusCode, 401);
    await loginAs('cajero', 'caro', '222222');
  });

  it('desactivar a un cajero cierra su sesión y le impide entrar', async () => {
    assert.equal((await call('admin', 'PATCH', `/api/users/${ids['cajero']}`, { active: false })).statusCode, 200);
    assert.equal((await call('cajero', 'GET', '/auth/me')).statusCode, 401);
    assert.equal((await login('caro', '222222')).statusCode, 401);
  });

  it('el recovery code restablece al dueño y le recuerda su usuario', async () => {
    const recover = (recoveryCode: string) => app.inject({
      method: 'POST', url: '/auth/recover', headers: { host: HOST },
      payload: { recoveryCode, newPassword: 'nueva-clave-123' },
    });
    assert.equal((await recover('codigo-falso')).statusCode, 401);

    const res = await recover(recoveryCode);
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().username, 'ana');
    assert.equal((await call('dueno', 'GET', '/auth/me')).statusCode, 401, 'las sesiones anteriores se cierran');
    assert.equal((await login('ana', 'nueva-clave-123')).statusCode, 200);
  });
});
