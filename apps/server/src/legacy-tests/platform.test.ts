import { strict as assert } from 'assert';
import { after, before, describe, it } from 'node:test';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// config.ts lee process.env al importarse: el entorno debe fijarse antes de cargar la app.
const dataDir = mkdtempSync(join(tmpdir(), 'dosuxsoft-platform-'));
process.env['DATA_DIR'] = dataDir;
process.env['TENANT_BASE_DOMAIN'] = 'dosuxsoft.test';
process.env['NODE_ENV'] = 'development';
delete process.env['DEV_TENANT'];

const { addMonths, subscriptionStatus } = await import('@sipnato/shared');
const { buildApp } = await import('../app.js');
const { closeAllTenantDbs, currentTenant, runWithTenant } = await import('../db/client.js');
const { closeControlDb, findTenant } = await import('../db/control.js');
const { COOKIE_NAME, PLATFORM_COOKIE_NAME } = await import('../lib/constants.js');
const { hashPassword } = await import('../lib/crypto.js');
const { todayCR } = await import('../lib/cr-time.js');
const { insertSuperadmin } = await import('../modules/platform/repository.js');

type App = Awaited<ReturnType<typeof buildApp>>;

const ADMIN_HOST = 'admin.dosuxsoft.test';
const PASSWORD = 'clave-segura-123';
const host = (slug: string) => `${slug}.dosuxsoft.test`;

// El login tiene rate limit por IP: cada prueba que inicia sesión usa su propia IP.
let ipCounter = 1;
const nextIp = () => `10.0.0.${ipCounter++}`;

async function platformLogin(app: App, username: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/platform/auth/login',
    headers: { host: ADMIN_HOST },
    remoteAddress: nextIp(),
    payload: { username, password },
  });
}

describe('panel de superadministrador', () => {
  let app: App;
  let platformToken: string;
  let ownerToken: string;
  let setupCode: string;

  const asAdmin = () => ({ host: ADMIN_HOST, cookie: `${PLATFORM_COOKIE_NAME}=${platformToken}` });
  const asOwner = (slug = 'tienda-nueva') => ({
    host: host(slug),
    cookie: `${COOKIE_NAME}=${ownerToken}`,
  });

  function patchTenant(slug: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'PATCH',
      url: `/platform/tenants/${slug}`,
      headers: asAdmin(),
      payload,
    });
  }

  function pay(slug: string, months: number, amount = 15000) {
    return app.inject({
      method: 'POST',
      url: `/platform/tenants/${slug}/payments`,
      headers: asAdmin(),
      payload: {
        amount,
        months,
        method: 'sinpe',
        reference: 'SINPE 123',
        paidAt: todayCR(),
        notes: '',
      },
    });
  }

  before(async () => {
    insertSuperadmin('root', await hashPassword(PASSWORD));
    insertSuperadmin('otro', await hashPassword(PASSWORD));
    app = await buildApp({ startJobs: false });
  });

  after(async () => {
    await app.close();
    closeAllTenantDbs();
    closeControlDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('fechas de la suscripción', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
    assert.equal(addMonths('2026-11-15', 3), '2027-02-15');
    assert.deepEqual(subscriptionStatus(null, '2026-10-07'), {
      status: 'sin_cobro',
      daysLeft: null,
    });
    assert.deepEqual(subscriptionStatus('2026-10-07', '2026-10-07'), {
      status: 'por_vencer',
      daysLeft: 0,
    });
    assert.deepEqual(subscriptionStatus('2026-10-12', '2026-10-07'), {
      status: 'por_vencer',
      daysLeft: 5,
    });
    assert.deepEqual(subscriptionStatus('2026-10-13', '2026-10-07'), {
      status: 'al_dia',
      daysLeft: 6,
    });
    assert.deepEqual(subscriptionStatus('2026-10-06', '2026-10-07'), {
      status: 'vencido',
      daysLeft: -1,
    });
  });

  it('credenciales incorrectas → 401; correctas abren sesión', async () => {
    assert.equal((await platformLogin(app, 'root', 'mala-clave-123')).statusCode, 401);
    assert.equal((await platformLogin(app, 'nadie', PASSWORD)).statusCode, 401);

    const res = await platformLogin(app, 'root', PASSWORD);
    assert.equal(res.statusCode, 200, res.body);
    platformToken = res.cookies.find((c) => c.name === PLATFORM_COOKIE_NAME)!.value;

    const me = await app.inject({ method: 'GET', url: '/platform/auth/me', headers: asAdmin() });
    assert.equal(me.json().superadmin.username, 'root');
  });

  it('5 intentos fallidos bloquean la cuenta aunque luego la clave sea correcta', async () => {
    for (let i = 0; i < 4; i++)
      assert.equal((await platformLogin(app, 'otro', 'mala-clave-123')).statusCode, 401);
    assert.equal((await platformLogin(app, 'otro', 'mala-clave-123')).statusCode, 429);
    assert.equal((await platformLogin(app, 'otro', PASSWORD)).statusCode, 429);
  });

  it('el panel no existe fuera de admin.<dominio> ni expone rutas de negocio', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/platform/tenants',
      headers: asAdmin(),
      payload: {
        slug: 'tienda-nueva',
        name: 'Tienda Nueva',
        contactName: 'Ana',
        contactPhone: '88887777',
        paidUntil: null,
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    setupCode = created.json().setupCode;

    // API del panel desde el subdominio de un negocio, aun con la cookie del panel.
    const fromTenant = await app.inject({
      method: 'GET',
      url: '/platform/tenants',
      headers: { host: host('tienda-nueva'), cookie: `${PLATFORM_COOKIE_NAME}=${platformToken}` },
    });
    assert.equal(fromTenant.statusCode, 404);

    // Rutas de negocio desde el panel.
    for (const url of ['/auth/status', '/api/notes', '/api/subscription']) {
      const res = await app.inject({ method: 'GET', url, headers: { host: ADMIN_HOST } });
      assert.equal(res.statusCode, 404, url);
    }
  });

  it('crea el negocio con su BD y un código de activación que funciona', async () => {
    assert.ok(existsSync(join(dataDir, 'tenants', 'tienda-nueva.db')));

    const setup = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      headers: { host: host('tienda-nueva') },
      payload: {
        setupCode,
        username: 'dueno',
        displayName: 'Ana',
        password: PASSWORD,
        confirmPassword: PASSWORD,
      },
    });
    assert.equal(setup.statusCode, 201, setup.body);
    ownerToken = setup.cookies.find((c) => c.name === COOKIE_NAME)!.value;

    const list = await app.inject({ method: 'GET', url: '/platform/tenants', headers: asAdmin() });
    const tenant = list.json().tenants.find((t: { slug: string }) => t.slug === 'tienda-nueva');
    assert.equal(tenant.activated, true);
    assert.equal(tenant.subscription, 'sin_cobro');

    // Ya tiene dueño: no se emite otro código.
    const again = await app.inject({
      method: 'POST',
      url: '/platform/tenants/tienda-nueva/setup-code',
      headers: asAdmin(),
    });
    assert.equal(again.statusCode, 409);
  });

  it('una BD migrada que ya trae dueño cuenta como activada aunque quede un código', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/platform/tenants',
      headers: asAdmin(),
      payload: { slug: 'migrado', name: 'Migrado', paidUntil: null },
    });
    assert.equal(res.statusCode, 201);
    // Como al copiar el dosuxsoft.db de la versión anterior sobre tenants/<slug>.db.
    runWithTenant('migrado', () =>
      currentTenant()
        .sqlite.prepare(
          "INSERT INTO users (username, display_name, role, secret_hash) VALUES ('dueno', 'Dueño', 'dueno', 'x')",
        )
        .run(),
    );
    const list = await app.inject({ method: 'GET', url: '/platform/tenants', headers: asAdmin() });
    assert.equal(
      list.json().tenants.find((t: { slug: string }) => t.slug === 'migrado').activated,
      true,
    );
  });

  it('el panel asigna tipo de negocio y módulos; el dueño solo los ve', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/platform/tenants',
      headers: asAdmin(),
      payload: {
        slug: 'mecanica',
        name: 'Mecánica',
        paidUntil: null,
        template: 'taller',
        modules: ['ordenes', 'inventario'],
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.json().tenant.template, 'taller');
    assert.deepEqual(created.json().tenant.modules, ['ordenes', 'inventario']);

    // Sin módulos: los de la plantilla.
    const porDefecto = await app.inject({
      method: 'POST',
      url: '/platform/tenants',
      headers: asAdmin(),
      payload: { slug: 'boutique', name: 'Boutique', paidUntil: null, template: 'tienda' },
    });
    assert.equal(porDefecto.json().tenant.modules.includes('ordenes'), false);

    const reassigned = await app.inject({
      method: 'PUT',
      url: '/platform/tenants/mecanica/business',
      headers: asAdmin(),
      payload: { template: 'electronica', modules: ['ordenes', 'creditos'] },
    });
    assert.equal(reassigned.statusCode, 200, reassigned.body);
    assert.equal(reassigned.json().tenant.template, 'electronica');

    const invalid = await app.inject({
      method: 'PUT',
      url: '/platform/tenants/mecanica/business',
      headers: asAdmin(),
      payload: { template: 'nave-espacial', modules: [] },
    });
    assert.equal(invalid.statusCode, 400);

    const detail = (
      await app.inject({ method: 'GET', url: '/platform/tenants/mecanica', headers: asAdmin() })
    ).json();
    const assigned = detail.activity.find(
      (a: { action: string }) => a.action === 'TENANT_BUSINESS_ASSIGNED',
    );
    assert.deepEqual(assigned.payload.template, { from: 'taller', to: 'electronica' });

    // Desde el subdominio de un negocio la ruta no existe.
    const fromTenant = await app.inject({
      method: 'PUT',
      url: '/platform/tenants/mecanica/business',
      headers: { host: host('mecanica'), cookie: `${PLATFORM_COOKIE_NAME}=${platformToken}` },
      payload: { template: 'tienda', modules: [] },
    });
    assert.equal(fromTenant.statusCode, 404);
  });

  it('la sesión de un negocio no abre el panel', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/platform/tenants',
      headers: { host: ADMIN_HOST, cookie: `${COOKIE_NAME}=${ownerToken}` },
    });
    assert.equal(res.statusCode, 401);
  });

  it('rechaza subdominios repetidos, reservados o inválidos', async () => {
    for (const [slug, code] of [
      ['tienda-nueva', 409],
      ['admin', 400],
      ['www', 400],
      ['Mal_Slug', 400],
      ['-x', 400],
    ] as const) {
      const res = await app.inject({
        method: 'POST',
        url: '/platform/tenants',
        headers: asAdmin(),
        payload: { slug, name: 'X', paidUntil: null },
      });
      assert.equal(res.statusCode, code, `${slug}: ${res.body}`);
    }
  });

  it('un pago extiende desde el vencimiento, aunque ya haya pasado', async () => {
    assert.equal((await patchTenant('tienda-nueva', { paidUntil: '2026-01-31' })).statusCode, 200);
    const res = await pay('tienda-nueva', 1);
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().tenant.paidUntil, '2026-02-28');
    assert.equal((await pay('tienda-nueva', 2)).json().tenant.paidUntil, '2026-04-28');
  });

  it('anular el último pago devuelve el vencimiento; uno anterior no', async () => {
    const detail = (
      await app.inject({ method: 'GET', url: '/platform/tenants/tienda-nueva', headers: asAdmin() })
    ).json();
    const [latest, older] = detail.payments as { id: number }[];

    const voidOlder = await app.inject({
      method: 'POST',
      url: `/platform/tenants/tienda-nueva/payments/${older!.id}/void`,
      headers: asAdmin(),
    });
    assert.equal(voidOlder.json().paidUntilReverted, false);
    assert.equal(voidOlder.json().tenant.paidUntil, '2026-04-28');

    const voidLatest = await app.inject({
      method: 'POST',
      url: `/platform/tenants/tienda-nueva/payments/${latest!.id}/void`,
      headers: asAdmin(),
    });
    assert.equal(voidLatest.json().paidUntilReverted, true);
    assert.equal(voidLatest.json().tenant.paidUntil, '2026-02-28');

    const twice = await app.inject({
      method: 'POST',
      url: `/platform/tenants/tienda-nueva/payments/${latest!.id}/void`,
      headers: asAdmin(),
    });
    assert.equal(twice.statusCode, 409);

    // Los pagos de un negocio no se anulan desde la URL de otro.
    await app.inject({
      method: 'POST',
      url: '/platform/tenants',
      headers: asAdmin(),
      payload: { slug: 'otro-negocio', name: 'Otro', paidUntil: null },
    });
    const cross = await app.inject({
      method: 'POST',
      url: `/platform/tenants/otro-negocio/payments/${older!.id}/void`,
      headers: asAdmin(),
    });
    assert.equal(cross.statusCode, 404);
  });

  it('vencido no bloquea: el negocio sigue operando y ve su aviso', async () => {
    await app.inject({
      method: 'PUT',
      url: '/platform/settings',
      headers: asAdmin(),
      payload: {
        defaultMonthlyPrice: 15000,
        paymentInstructions: 'SINPE 8888-0000',
        reminderMessage: '',
      },
    });

    const notes = await app.inject({ method: 'GET', url: '/api/notes', headers: asOwner() });
    assert.equal(notes.statusCode, 200);

    const sub = await app.inject({ method: 'GET', url: '/api/subscription', headers: asOwner() });
    assert.equal(sub.statusCode, 200, sub.body);
    const info = sub.json();
    assert.equal(info.status, 'vencido');
    assert.equal(info.monthlyPrice, 15000);
    assert.equal(info.paymentInstructions, 'SINPE 8888-0000');
    assert.equal(info.payments.length, 0, 'los dos pagos se anularon: no se muestran');
  });

  it('el cajero no ve la suscripción', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: asOwner(),
      payload: { username: 'caja1', displayName: 'Caja', role: 'cajero', secret: '123456' },
    });
    assert.equal(created.statusCode, 201, created.body);
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { host: host('tienda-nueva') },
      remoteAddress: nextIp(),
      payload: { username: 'caja1', password: '123456' },
    });
    const token = login.cookies.find((c) => c.name === COOKIE_NAME)!.value;
    const res = await app.inject({
      method: 'GET',
      url: '/api/subscription',
      headers: { host: host('tienda-nueva'), cookie: `${COOKIE_NAME}=${token}` },
    });
    assert.equal(res.statusCode, 403);
  });

  it('el precio especial reemplaza al de la plataforma', async () => {
    const res = await patchTenant('tienda-nueva', { monthlyPrice: 9000 });
    assert.equal(res.json().tenant.effectivePrice, 9000);
    const sub = await app.inject({ method: 'GET', url: '/api/subscription', headers: asOwner() });
    assert.equal(sub.json().monthlyPrice, 9000);
  });

  it('suspender desde el panel bloquea al negocio; reactivar lo devuelve', async () => {
    const suspend = await app.inject({
      method: 'POST',
      url: '/platform/tenants/tienda-nueva/status',
      headers: asAdmin(),
      payload: { status: 'suspended' },
    });
    assert.equal(suspend.statusCode, 200);
    assert.equal(findTenant('tienda-nueva')!.status, 'suspended');
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/notes', headers: asOwner() })).statusCode,
      403,
    );

    await app.inject({
      method: 'POST',
      url: '/platform/tenants/tienda-nueva/status',
      headers: asAdmin(),
      payload: { status: 'active' },
    });
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/notes', headers: asOwner() })).statusCode,
      200,
    );
  });

  it('la actividad registra quién hizo cada cambio', async () => {
    const detail = (
      await app.inject({ method: 'GET', url: '/platform/tenants/tienda-nueva', headers: asAdmin() })
    ).json();
    const actions = detail.activity.map((a: { action: string }) => a.action);
    for (const action of [
      'TENANT_CREATED',
      'PAYMENT_RECORDED',
      'PAYMENT_VOIDED',
      'TENANT_SUSPENDED',
      'TENANT_ACTIVATED',
    ]) {
      assert.ok(actions.includes(action), action);
    }
    assert.ok(detail.activity.every((a: { superadmin: string }) => a.superadmin === 'root'));
    assert.equal(detail.usage.users, 2);
  });

  it('Caddy puede emitir el certificado del panel', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/internal/tls-check?domain=${ADMIN_HOST}`,
    });
    assert.equal(res.statusCode, 200);
  });

  it('cambiar la contraseña cierra las demás sesiones', async () => {
    const second = await platformLogin(app, 'root', PASSWORD);
    const secondToken = second.cookies.find((c) => c.name === PLATFORM_COOKIE_NAME)!.value;

    const change = await app.inject({
      method: 'POST',
      url: '/platform/auth/password',
      headers: asAdmin(),
      payload: {
        currentPassword: PASSWORD,
        newPassword: 'otra-clave-456',
        confirmPassword: 'otra-clave-456',
      },
    });
    assert.equal(change.statusCode, 200, change.body);
    platformToken = change.cookies.find((c) => c.name === PLATFORM_COOKIE_NAME)!.value;

    const old = await app.inject({
      method: 'GET',
      url: '/platform/auth/me',
      headers: { host: ADMIN_HOST, cookie: `${PLATFORM_COOKIE_NAME}=${secondToken}` },
    });
    assert.equal(old.statusCode, 401);
    assert.equal(
      (await app.inject({ method: 'GET', url: '/platform/auth/me', headers: asAdmin() }))
        .statusCode,
      200,
    );
  });
});
