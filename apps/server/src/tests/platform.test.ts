import { addMonths, subscriptionStatus } from '@sipnato/shared';
import { runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { findTenant, getSetupCodeHash, insertTenant } from '../db/control.js';
import { todayCR } from '../lib/cr-time.js';
import { insertUserRow } from '../modules/users/repository.js';
import {
  call,
  inPlatform,
  inTenant,
  createSuperadmin,
  login,
  nextIp,
  platformCall,
  platformLogin,
  platformStub,
  platformToken,
  sessionToken,
  tenantStub,
  type Method,
} from './helpers.js';

const PASSWORD = 'clave-segura-123';

const json = async <T = Record<string, unknown>>(res: Response | Promise<Response>) =>
  (await (await res).json()) as T;

interface TenantView {
  slug: string;
  activated: boolean;
  subscription: string;
  template: string;
  modules: string[];
  paidUntil: string | null;
  effectivePrice: number;
}

describe('panel de superadministrador', () => {
  let adminToken = '';
  let ownerToken = '';
  let setupCode = '';

  const admin = (method: Method, path: string, body?: unknown) =>
    platformCall(method, path, { token: adminToken, body });
  const owner = (method: Method, path: string, body?: unknown) =>
    call('tienda-nueva', method, path, { token: ownerToken, body });

  const listTenants = async () =>
    (await json<{ tenants: TenantView[] }>(admin('GET', '/platform/tenants'))).tenants;

  const pay = (slug: string, months: number, amount = 15000) =>
    admin('POST', `/platform/tenants/${slug}/payments`, {
      amount,
      months,
      method: 'sinpe',
      reference: 'SINPE 123',
      paidAt: todayCR(),
      notes: '',
    });

  beforeAll(async () => {
    await createSuperadmin('root', PASSWORD);
    await createSuperadmin('otro', PASSWORD);
  });

  it('fechas de la suscripción', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(subscriptionStatus(null, '2026-10-07')).toEqual({ status: 'sin_cobro', daysLeft: null });
    expect(subscriptionStatus('2026-10-07', '2026-10-07')).toEqual({
      status: 'por_vencer',
      daysLeft: 0,
    });
    expect(subscriptionStatus('2026-10-12', '2026-10-07')).toEqual({
      status: 'por_vencer',
      daysLeft: 5,
    });
    expect(subscriptionStatus('2026-10-13', '2026-10-07')).toEqual({
      status: 'al_dia',
      daysLeft: 6,
    });
    expect(subscriptionStatus('2026-10-06', '2026-10-07')).toEqual({
      status: 'vencido',
      daysLeft: -1,
    });
  });

  it('credenciales incorrectas → 401; correctas abren sesión con su propia cookie', async () => {
    expect((await platformLogin('root', 'mala-clave-123')).status).toBe(401);
    expect((await platformLogin('nadie', PASSWORD)).status).toBe(401);

    const res = await platformLogin('root', PASSWORD);
    expect(res.status).toBe(200);
    adminToken = platformToken(res)!;
    const cookie = res.headers.getSetCookie()[0]!.toLowerCase();
    expect(cookie).toMatch(/^dosuxsoft_platform=/);
    expect(cookie).toContain('httponly');
    expect(cookie).toContain('secure');
    expect(cookie).toContain('samesite=strict');
    expect(cookie).toContain('max-age=28800');
    expect(cookie).not.toContain('domain');

    const me = await json<{ superadmin: { username: string } }>(admin('GET', '/platform/auth/me'));
    expect(me.superadmin.username).toBe('root');
  });

  it('5 intentos fallidos bloquean la cuenta aunque luego la clave sea correcta', async () => {
    for (let i = 0; i < 4; i++)
      expect((await platformLogin('otro', 'mala-clave-123')).status).toBe(401);
    expect((await platformLogin('otro', 'mala-clave-123')).status).toBe(429);
    expect((await platformLogin('otro', PASSWORD)).status).toBe(429);
  });

  it('el login del panel tiene límite de 5 intentos por IP cada 15 minutos', async () => {
    const ip = '198.51.100.20';
    for (let i = 0; i < 5; i++) expect((await platformLogin('nadie', 'x', ip)).status).toBe(401);
    const sexto = await platformLogin('nadie', 'x', ip);
    expect(sexto.status).toBe(429);
    expect(Number(sexto.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('/health responde en el panel', async () => {
    const res = await platformCall('GET', '/health');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({ status: 'ok', environment: 'test', time: expect.any(String) });
  });

  it('el panel no existe fuera de admin.<dominio> ni expone rutas de negocio', async () => {
    const created = await admin('POST', '/platform/tenants', {
      slug: 'tienda-nueva',
      name: 'Tienda Nueva',
      contactName: 'Ana',
      contactPhone: '88887777',
      paidUntil: null,
    });
    expect(created.status, await created.clone().text()).toBe(201);
    setupCode = (await json<{ setupCode: string }>(created)).setupCode;

    // API del panel desde el subdominio de un negocio, aun con la cookie del panel.
    const fromTenant = await call('tienda-nueva', 'GET', '/platform/tenants', {
      headers: { Cookie: `dosuxsoft_platform=${adminToken}` },
    });
    expect(fromTenant.status).toBe(404);

    // Rutas de negocio desde el panel.
    for (const path of ['/auth/status', '/api/notes', '/api/subscription']) {
      expect((await platformCall('GET', path)).status, path).toBe(404);
    }
  });

  it('crea el negocio inicializado y con un código de activación que funciona', async () => {
    expect((await json(call('tienda-nueva', 'GET', '/auth/status'))).setup).toBe(false);

    const setup = await call('tienda-nueva', 'POST', '/auth/setup', {
      body: {
        setupCode,
        username: 'dueno',
        displayName: 'Ana',
        password: PASSWORD,
        confirmPassword: PASSWORD,
      },
    });
    expect(setup.status, await setup.clone().text()).toBe(201);
    ownerToken = sessionToken(setup)!;

    const tenant = (await listTenants()).find((t) => t.slug === 'tienda-nueva')!;
    expect(tenant.activated).toBe(true);
    expect(tenant.subscription).toBe('sin_cobro');

    // Ya tiene dueño: no se emite otro código.
    expect((await admin('POST', '/platform/tenants/tienda-nueva/setup-code')).status).toBe(409);
  });

  it('el setup del dueño consume el código por RPC y un segundo uso falla', async () => {
    const { setupCode: code } = await json<{ setupCode: string }>(
      admin('POST', '/platform/tenants', { slug: 'dos-usos', name: 'Dos usos', paidUntil: null }),
    );
    const body = (username: string, setupCode = code) => ({
      setupCode,
      username,
      displayName: 'Dueño',
      password: PASSWORD,
      confirmPassword: PASSWORD,
    });

    // Un código equivocado no crea al dueño ni gasta el bueno.
    const wrong = await call('dos-usos', 'POST', '/auth/setup', {
      body: body('intruso', '0000-0000-0000-0000'),
    });
    expect(wrong.status).toBe(403);
    expect((await json(wrong)).error).toEqual({
      code: 'SETUP_CODE_INVALID',
      message: 'Código de activación inválido',
    });
    expect((await json(call('dos-usos', 'GET', '/auth/status'))).setup).toBe(false);
    expect(await inPlatform(() => getSetupCodeHash('dos-usos'))).not.toBeNull();

    expect((await call('dos-usos', 'POST', '/auth/setup', { body: body('dueno') })).status).toBe(
      201,
    );
    expect(await inPlatform(() => getSetupCodeHash('dos-usos'))).toBeNull();

    // El segundo uso: el negocio ya tiene dueño y el código ya no sirve en la plataforma.
    expect((await call('dos-usos', 'POST', '/auth/setup', { body: body('otro') })).status).toBe(
      409,
    );
    expect(await platformStub().consumeSetupCode('dos-usos', code)).toBe(false);
    expect((await tenantStub('dos-usos').platformSummary())?.users).toBe(1);
  });

  it('dos activaciones simultáneas con el mismo código: solo una crea al dueño', async () => {
    const { setupCode: code } = await json<{ setupCode: string }>(
      admin('POST', '/platform/tenants', { slug: 'carrera', name: 'Carrera', paidUntil: null }),
    );
    const body = (username: string) => ({
      setupCode: code,
      username,
      displayName: 'Dueño',
      password: PASSWORD,
      confirmPassword: PASSWORD,
    });
    const results = await Promise.all([
      call('carrera', 'POST', '/auth/setup', { body: body('primero'), ip: nextIp() }),
      call('carrera', 'POST', '/auth/setup', { body: body('segundo'), ip: nextIp() }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(201);
    // 403 si el otro llegó a consumir el código ya gastado; 409 si ya encontró al dueño.
    expect([403, 409]).toContain(statuses[1]);
    expect((await tenantStub('carrera').platformSummary())?.users).toBe(1);
  });

  it('el panel lista un negocio cuyo DO nunca se inicializó como "Sin activar" sin crear su BD', async () => {
    // Como si el alta hubiera fallado justo después de guardar el negocio en la plataforma.
    await inPlatform(() => insertTenant('fantasma', 'Fantasma'));
    const tenant = (await listTenants()).find((t) => t.slug === 'fantasma')!;
    expect(tenant.activated).toBe(false);

    expect(await tenantStub('fantasma').platformSummary()).toBeNull();
    const state = await runInDurableObject(tenantStub('fantasma'), (_i, s) => ({
      kv: [...s.storage.kv.list()],
      tables: s.storage.sql
        .exec(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*'",
        )
        .toArray(),
    }));
    expect(state).toEqual({ kv: [], tables: [] });
  });

  it('una BD que ya trae dueño cuenta como activada aunque quede un código', async () => {
    expect(
      (
        await admin('POST', '/platform/tenants', {
          slug: 'migrado',
          name: 'Migrado',
          paidUntil: null,
        })
      ).status,
    ).toBe(201);
    await inTenant('migrado', () =>
      insertUserRow(
        {
          username: 'dueno',
          displayName: 'Dueño',
          role: 'dueno',
          secretHash: 'x',
          recoveryCodeHash: null,
        },
        { ip: null, userAgent: null },
      ),
    );
    expect((await listTenants()).find((t) => t.slug === 'migrado')!.activated).toBe(true);
  });

  it('el panel asigna tipo de negocio y módulos; el dueño solo los ve', async () => {
    const created = await admin('POST', '/platform/tenants', {
      slug: 'mecanica',
      name: 'Mecánica',
      paidUntil: null,
      template: 'taller',
      modules: ['ordenes', 'inventario'],
    });
    expect(created.status, await created.clone().text()).toBe(201);
    const { tenant } = await json<{ tenant: TenantView }>(created);
    expect(tenant.template).toBe('taller');
    expect(tenant.modules).toEqual(['ordenes', 'inventario']);

    // Sin módulos: los de la plantilla.
    const porDefecto = await json<{ tenant: TenantView }>(
      admin('POST', '/platform/tenants', {
        slug: 'boutique',
        name: 'Boutique',
        paidUntil: null,
        template: 'tienda',
      }),
    );
    expect(porDefecto.tenant.modules.includes('ordenes')).toBe(false);

    const reassigned = await admin('PUT', '/platform/tenants/mecanica/business', {
      template: 'electronica',
      modules: ['ordenes', 'creditos'],
    });
    expect(reassigned.status).toBe(200);
    expect((await json<{ tenant: TenantView }>(reassigned)).tenant.template).toBe('electronica');

    const invalid = await admin('PUT', '/platform/tenants/mecanica/business', {
      template: 'nave-espacial',
      modules: [],
    });
    expect(invalid.status).toBe(400);

    const detail = await json<{ activity: { action: string; payload: Record<string, unknown> }[] }>(
      admin('GET', '/platform/tenants/mecanica'),
    );
    const assigned = detail.activity.find((a) => a.action === 'TENANT_BUSINESS_ASSIGNED')!;
    expect(assigned.payload['template']).toEqual({ from: 'taller', to: 'electronica' });

    // Desde el subdominio de un negocio la ruta no existe.
    const fromTenant = await call('mecanica', 'PUT', '/platform/tenants/mecanica/business', {
      headers: { Cookie: `dosuxsoft_platform=${adminToken}` },
      body: { template: 'tienda', modules: [] },
    });
    expect(fromTenant.status).toBe(404);
  });

  it('la sesión de un negocio no abre el panel', async () => {
    const res = await platformCall('GET', '/platform/tenants', {
      headers: { Cookie: `sipnato_session=${ownerToken}` },
    });
    expect(res.status).toBe(401);
  });

  it('rechaza subdominios repetidos, reservados o inválidos', async () => {
    for (const [slug, code] of [
      ['tienda-nueva', 409],
      ['admin', 400],
      ['www', 400],
      ['Mal_Slug', 400],
      ['-x', 400],
    ] as const) {
      const res = await admin('POST', '/platform/tenants', { slug, name: 'X', paidUntil: null });
      expect(res.status, slug).toBe(code);
    }
  });

  it('un pago extiende desde el vencimiento, aunque ya haya pasado', async () => {
    expect(
      (await admin('PATCH', '/platform/tenants/tienda-nueva', { paidUntil: '2026-01-31' })).status,
    ).toBe(200);
    const res = await pay('tienda-nueva', 1);
    expect(res.status).toBe(201);
    expect((await json<{ tenant: TenantView }>(res)).tenant.paidUntil).toBe('2026-02-28');
    expect((await json<{ tenant: TenantView }>(pay('tienda-nueva', 2))).tenant.paidUntil).toBe(
      '2026-04-28',
    );
  });

  it('/api/subscription de un negocio refleja un pago registrado en el panel', async () => {
    const sub = await json<{ paidUntil: string; payments: { months: number }[] }>(
      owner('GET', '/api/subscription'),
    );
    expect(sub.paidUntil).toBe('2026-04-28');
    expect(sub.payments.map((p) => p.months)).toEqual([2, 1]);
  });

  it('anular el último pago devuelve el vencimiento; uno anterior no', async () => {
    const detail = await json<{ payments: { id: number }[] }>(
      admin('GET', '/platform/tenants/tienda-nueva'),
    );
    const [latest, older] = detail.payments;

    const voidOlder = await json<{ paidUntilReverted: boolean; tenant: TenantView }>(
      admin('POST', `/platform/tenants/tienda-nueva/payments/${older!.id}/void`),
    );
    expect(voidOlder.paidUntilReverted).toBe(false);
    expect(voidOlder.tenant.paidUntil).toBe('2026-04-28');

    const voidLatest = await json<{ paidUntilReverted: boolean; tenant: TenantView }>(
      admin('POST', `/platform/tenants/tienda-nueva/payments/${latest!.id}/void`),
    );
    expect(voidLatest.paidUntilReverted).toBe(true);
    expect(voidLatest.tenant.paidUntil).toBe('2026-02-28');

    expect(
      (await admin('POST', `/platform/tenants/tienda-nueva/payments/${latest!.id}/void`)).status,
    ).toBe(409);

    // Los pagos de un negocio no se anulan desde la URL de otro.
    await admin('POST', '/platform/tenants', {
      slug: 'otro-negocio',
      name: 'Otro',
      paidUntil: null,
    });
    expect(
      (await admin('POST', `/platform/tenants/otro-negocio/payments/${older!.id}/void`)).status,
    ).toBe(404);
    expect((await admin('POST', '/platform/tenants/otro-negocio/payments/abc/void')).status).toBe(
      400,
    );
  });

  it('vencido no bloquea: el negocio sigue operando y ve su aviso', async () => {
    await admin('PUT', '/platform/settings', {
      defaultMonthlyPrice: 15000,
      paymentInstructions: 'SINPE 8888-0000',
      reminderMessage: '',
    });

    expect((await owner('GET', '/api/notes')).status).toBe(200);

    const sub = await owner('GET', '/api/subscription');
    expect(sub.status).toBe(200);
    const info = await json<{
      status: string;
      monthlyPrice: number;
      paymentInstructions: string;
      payments: unknown[];
    }>(sub);
    expect(info.status).toBe('vencido');
    expect(info.monthlyPrice).toBe(15000);
    expect(info.paymentInstructions).toBe('SINPE 8888-0000');
    expect(info.payments, 'los dos pagos se anularon: no se muestran').toHaveLength(0);
  });

  it('el cajero no ve la suscripción', async () => {
    const created = await owner('POST', '/api/users', {
      username: 'caja1',
      displayName: 'Caja',
      role: 'cajero',
      secret: '123456',
    });
    expect(created.status).toBe(201);
    const token = sessionToken(await login('tienda-nueva', 'caja1', '123456'))!;
    expect((await call('tienda-nueva', 'GET', '/api/subscription', { token })).status).toBe(403);
  });

  it('el precio especial reemplaza al de la plataforma', async () => {
    const res = await json<{ tenant: TenantView }>(
      admin('PATCH', '/platform/tenants/tienda-nueva', { monthlyPrice: 9000 }),
    );
    expect(res.tenant.effectivePrice).toBe(9000);
    expect((await json(owner('GET', '/api/subscription'))).monthlyPrice).toBe(9000);
  });

  it('suspender desde el panel lo marca en la plataforma; reactivar lo devuelve', async () => {
    const suspend = await admin('POST', '/platform/tenants/tienda-nueva/status', {
      status: 'suspended',
    });
    expect(suspend.status).toBe(200);
    expect(await inPlatform(() => findTenant('tienda-nueva')!.status)).toBe('suspended');
    expect(await platformStub().resolveTenant('tienda-nueva')).toEqual({ status: 'suspended' });
    expect(await platformStub().listActiveSlugs()).not.toContain('tienda-nueva');

    await admin('POST', '/platform/tenants/tienda-nueva/status', { status: 'active' });
    expect(await platformStub().resolveTenant('tienda-nueva')).toEqual({ status: 'active' });
    expect(await platformStub().listActiveSlugs()).toContain('tienda-nueva');
    expect(await platformStub().resolveTenant('no-existe')).toBeNull();
  });

  it('la actividad registra quién hizo cada cambio', async () => {
    const detail = await json<{
      activity: { action: string; superadmin: string }[];
      usage: { users: number; lastSaleAt: string | null };
    }>(admin('GET', '/platform/tenants/tienda-nueva'));
    const actions = detail.activity.map((a) => a.action);
    for (const action of [
      'TENANT_CREATED',
      'PAYMENT_RECORDED',
      'PAYMENT_VOIDED',
      'TENANT_SUSPENDED',
      'TENANT_ACTIVATED',
    ]) {
      expect(actions, action).toContain(action);
    }
    expect(detail.activity.every((a) => a.superadmin === 'root')).toBe(true);
    expect(detail.usage).toEqual({ users: 2, lastSaleAt: null });
  });

  it('el respaldo de la plataforma vuelca sus tablas', async () => {
    const dump = await platformStub().exportControl();
    expect(Object.keys(dump.tables)).toEqual(
      expect.arrayContaining(['tenants', 'superadmins', 'subscription_payments']),
    );
    expect(Object.keys(dump.tables).some((t) => t.startsWith('_cf_'))).toBe(false);
  });

  it('cambiar la contraseña cierra las demás sesiones', async () => {
    const secondToken = platformToken(await platformLogin('root', PASSWORD))!;

    const change = await admin('POST', '/platform/auth/password', {
      currentPassword: PASSWORD,
      newPassword: 'otra-clave-456',
      confirmPassword: 'otra-clave-456',
    });
    expect(change.status).toBe(200);
    adminToken = platformToken(change)!;

    expect((await platformCall('GET', '/platform/auth/me', { token: secondToken })).status).toBe(
      401,
    );
    expect((await admin('GET', '/platform/auth/me')).status).toBe(200);
  });

  it('cerrar sesión borra la cookie y la sesión deja de servir', async () => {
    const token = platformToken(await platformLogin('root', 'otra-clave-456'))!;
    const out = await platformCall('POST', '/platform/auth/logout', { token });
    expect(out.status).toBe(200);
    expect(out.headers.getSetCookie()[0]).toMatch(/Max-Age=0/);
    expect((await platformCall('GET', '/platform/auth/me', { token })).status).toBe(401);
  });
});

describe('control.db solo existe dentro de la plataforma', () => {
  it('fuera del Durable Object de la plataforma lanza', async () => {
    expect(() => findTenant('x')).toThrow(/fuera de la plataforma/);
  });

  it('el código de un negocio no puede leer las tablas de la plataforma', async () => {
    await call('aislado', 'GET', '/auth/status'); // crea el stub
    await platformStub().listActiveSlugs();
    const error = await runInDurableObject(tenantStub('aislado'), () => {
      try {
        findTenant('tienda-nueva');
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(error).toMatch(/fuera de la plataforma/);
  });
});
