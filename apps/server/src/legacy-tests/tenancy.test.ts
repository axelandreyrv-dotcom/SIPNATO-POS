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
const { closeAllTenantDbs } = await import('../db/client.js');
const { closeControlDb, insertTenant, setSetupCodeHash, setTenantStatus } =
  await import('../db/control.js');
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
    payload: {
      setupCode,
      username: 'dueno',
      displayName: 'Dueño',
      password: PASSWORD,
      confirmPassword: PASSWORD,
    },
  });
}

async function setupAdmin(app: App, slug: string): Promise<string> {
  const res = await postSetup(app, slug, setupCodes.get(slug)!);
  assert.equal(res.statusCode, 201, res.body);
  const cookie = res.cookies.find((c) => c.name === COOKIE_NAME);
  assert.ok(cookie, 'setup debe devolver cookie de sesión');
  return cookie.value;
}

// Portados a vitest: aislamiento (Tarea 5, src/tests/tenancy.test.ts) y enrutado por Host, 404/403 y
// /health (Tarea 6, src/tests/routing.test.ts). Los de tls-check se descartaron: con Universal SSL
// (D12) ya no hay emisión de certificados bajo demanda ni /internal/tls-check. Queda solo el
// respaldo diario (Tarea 7).
describe('aislamiento entre negocios', () => {
  let app: App;

  before(async () => {
    await createTenantWithCode('taller-a', 'Taller A');
    await createTenantWithCode('tienda-b', 'Tienda B');
    await createTenantWithCode('suspendido', 'Negocio suspendido');
    setTenantStatus('suspendido', 'suspended');

    app = await buildApp({ startJobs: false });
    await setupAdmin(app, 'taller-a');
  });

  after(async () => {
    await app.close();
    closeAllTenantDbs();
    closeControlDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('el backup diario respalda cada negocio activo en su propia carpeta', async () => {
    const { runDailyBackup } = await import('../jobs/backup.js');
    await runDailyBackup(app.log);
    assert.ok(existsSync(join(dataDir, 'backups', 'taller-a', 'latest.db')));
    assert.ok(existsSync(join(dataDir, 'backups', 'tienda-b', 'latest.db')));
    assert.ok(!existsSync(join(dataDir, 'backups', 'suspendido')));
  });
});
