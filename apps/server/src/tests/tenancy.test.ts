import { strict as assert } from 'assert';
import { after, before, describe, it } from 'node:test';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// config.ts lee process.env al importarse: el entorno debe fijarse antes de cargar la app.
const dataDir = mkdtempSync(join(tmpdir(), 'dosuxsoft-tenancy-'));
process.env['DATA_DIR'] = dataDir;
process.env['TENANT_BASE_DOMAIN'] = 'dosuxsoft.test';
process.env['NODE_ENV'] = 'development';
delete process.env['DEV_TENANT'];

const { buildApp } = await import('../app.js');
const { closeAllTenantDbs, db } = await import('../db/client.js');
const { closeControlDb, getSetupCodeHash, insertTenant, setSetupCodeHash, setTenantStatus } = await import('../db/control.js');
const { COOKIE_NAME } = await import('../lib/constants.js');
const { generateSetupCode, hashSetupCode } = await import('../lib/crypto.js');

type App = Awaited<ReturnType<typeof buildApp>>;

const PASSWORD = 'clave-segura-123';
const host = (slug: string) => `${slug}.dosuxsoft.test`;
const setupCodes = new Map<string, string>();

async function createTenantWithCode(slug: string, name: string): Promise<void> {
  insertTenant(slug, name);
  const code = generateSetupCode();
  setSetupCodeHash(slug, await hashSetupCode(code));
  setupCodes.set(slug, code);
}

function postSetup(app: App, slug: string, setupCode: string) {
  return app.inject({
    method: 'POST',
    url: '/auth/setup',
    headers: { host: host(slug) },
    payload: { setupCode, username: 'dueno', displayName: 'Dueño', password: PASSWORD, confirmPassword: PASSWORD },
  });
}

async function setupAdmin(app: App, slug: string): Promise<string> {
  const res = await postSetup(app, slug, setupCodes.get(slug)!);
  assert.equal(res.statusCode, 201, res.body);
  const cookie = res.cookies.find((c) => c.name === COOKIE_NAME);
  assert.ok(cookie, 'setup debe devolver cookie de sesión');
  return cookie.value;
}

function authed(slug: string, token: string) {
  return { host: host(slug), cookie: `${COOKIE_NAME}=${token}` };
}

describe('aislamiento entre negocios', () => {
  let app: App;
  let tokenA: string;
  let tokenB: string;

  before(async () => {
    await createTenantWithCode('taller-a', 'Taller A');
    await createTenantWithCode('tienda-b', 'Tienda B');
    await createTenantWithCode('suspendido', 'Negocio suspendido');
    setTenantStatus('suspendido', 'suspended');

    app = await buildApp({ startJobs: false });
    tokenA = await setupAdmin(app, 'taller-a');
  });

  after(async () => {
    await app.close();
    closeAllTenantDbs();
    closeControlDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('configurar el admin de A no configura a B', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/status', headers: { host: host('tienda-b') } });
    assert.deepEqual(res.json(), { setup: false });
  });

  it('cada negocio tiene su propio archivo de BD', () => {
    assert.ok(existsSync(join(dataDir, 'tenants', 'taller-a.db')));
    assert.ok(existsSync(join(dataDir, 'tenants', 'tienda-b.db')));
    assert.ok(!existsSync(join(dataDir, 'tenants', 'no-existe.db')));
  });

  it('setup exige el código de activación del propio negocio', async () => {
    assert.equal((await postSetup(app, 'tienda-b', '0000-0000-0000-0000')).statusCode, 403);
    // El código de A ya se consumió y además pertenece a otro negocio.
    assert.equal((await postSetup(app, 'tienda-b', setupCodes.get('taller-a')!)).statusCode, 403);
    const status = await app.inject({ method: 'GET', url: '/auth/status', headers: { host: host('tienda-b') } });
    assert.deepEqual(status.json(), { setup: false });
  });

  it('el código se invalida al usarse', () => {
    assert.equal(getSetupCodeHash('taller-a'), null);
    assert.notEqual(getSetupCodeHash('tienda-b'), null);
  });

  it('la sesión de A no sirve en B', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: authed('tienda-b', tokenA) });
    assert.equal(res.statusCode, 401);
  });

  it('los usuarios de A no existen en B', async () => {
    // B aún no tiene usuarios: el mismo usuario/contraseña de A no abre B.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { host: host('tienda-b') },
      payload: { username: 'dueno', password: PASSWORD },
    });
    assert.equal(login.statusCode, 401);
    tokenB = await setupAdmin(app, 'tienda-b');
  });

  it('los datos creados en A no aparecen en B', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: authed('taller-a', tokenA),
      payload: { title: 'Nota privada de A', body: 'solo A' },
    });
    assert.equal(created.statusCode, 201, created.body);

    const listA = await app.inject({ method: 'GET', url: '/api/notes', headers: authed('taller-a', tokenA) });
    const listB = await app.inject({ method: 'GET', url: '/api/notes', headers: authed('tienda-b', tokenB) });
    assert.match(listA.body, /Nota privada de A/);
    assert.doesNotMatch(listB.body, /Nota privada de A/);
  });

  it('negocio inexistente → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/status', headers: { host: host('no-existe') } });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error.code, 'NEGOCIO_NO_ENCONTRADO');
  });

  it('dominio base, subdominios anidados y slugs maliciosos → 404', async () => {
    for (const h of ['dosuxsoft.test', 'a.taller-a.dosuxsoft.test', 'www.dosuxsoft.test', '..dosuxsoft.test', 'otro-dominio.com']) {
      const res = await app.inject({ method: 'GET', url: '/auth/status', headers: { host: h } });
      assert.equal(res.statusCode, 404, `host ${h} debería ser rechazado`);
    }
  });

  it('negocio suspendido → 403', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/status', headers: { host: host('suspendido') } });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error.code, 'NEGOCIO_SUSPENDIDO');
  });

  it('/health responde sin negocio', async () => {
    const res = await app.inject({ method: 'GET', url: '/health', headers: { host: 'localhost' } });
    assert.equal(res.statusCode, 200);
  });

  it('tls-check solo aprueba negocios activos', async () => {
    const check = (domain: string) =>
      app.inject({ method: 'GET', url: `/internal/tls-check?domain=${domain}`, headers: { host: 'server:3000' } });
    assert.equal((await check('taller-a.dosuxsoft.test')).statusCode, 200);
    assert.equal((await check('suspendido.dosuxsoft.test')).statusCode, 404);
    assert.equal((await check('no-existe.dosuxsoft.test')).statusCode, 404);
  });

  it('el backup diario respalda cada negocio activo en su propia carpeta', async () => {
    const { runDailyBackup } = await import('../jobs/backup.js');
    await runDailyBackup(app.log);
    assert.ok(existsSync(join(dataDir, 'backups', 'taller-a', 'latest.db')));
    assert.ok(existsSync(join(dataDir, 'backups', 'tienda-b', 'latest.db')));
    assert.ok(!existsSync(join(dataDir, 'backups', 'suspendido')));
  });

  it('acceder a la BD fuera de un negocio lanza (falla cerrado)', () => {
    assert.throws(() => db.select(), /sin negocio en contexto/);
  });
});
