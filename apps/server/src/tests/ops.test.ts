import { env, runInDurableObject, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { controlDb, findTenant } from '../db/control.js';
import { createPlatformApp } from '../platform-app.js';
import {
  ADMIN_ORIGIN,
  call,
  createSuperadmin,
  createTestTenant,
  inPlatform,
  login,
  loginToken,
  nextIp,
  platformCall,
  platformLogin,
  platformStub,
  platformToken,
  sessionToken,
  tenantStub,
  tenantUrl,
} from './helpers.js';

const OPS_TOKEN = env.OPS_TOKEN!;
const PASSWORD = 'clave-segura-123';

interface OpsOptions {
  // null = sin header Authorization.
  token?: string | null | undefined;
  ip?: string;
  url?: string;
}

// Cada llamada con su propia IP: el límite de 10/15 min por IP no debe tapar lo que se prueba.
function ops(body: unknown, opts: OpsOptions = {}): Promise<Response> {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'CF-Connecting-IP': opts.ip ?? nextIp(),
  });
  const token = opts.token === undefined ? OPS_TOKEN : opts.token;
  if (token !== null) headers.set('Authorization', `Bearer ${token}`);
  return SELF.fetch(opts.url ?? `${ADMIN_ORIGIN}/internal/ops`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const json = async <T = Record<string, unknown>>(res: Response | Promise<Response>) =>
  (await (await res).json()) as T;

async function opsOk<T = Record<string, unknown>>(command: string, args: object = {}): Promise<T> {
  const res = await ops({ command, args });
  expect(res.status, await res.clone().text()).toBe(200);
  return json<T>(res);
}

interface AuditRow {
  action: string;
  tenant_slug: string | null;
  payload: string | null;
  superadmin_id: number | null;
  ip: string | null;
}

const opsAudit = () =>
  inPlatform(() =>
    controlDb
      .prepare<[], AuditRow>(
        `SELECT action, tenant_slug, payload, superadmin_id, ip FROM platform_audit_log
         WHERE action LIKE 'OPS\\_%' ESCAPE '\\' ORDER BY id`,
      )
      .all(),
  );

const lastAudit = async () => (await opsAudit()).at(-1)!;

describe('/internal/ops: acceso', () => {
  it('sin token → 401 sin pista, no-store, y queda OPS_AUTH_FAILED con la IP', async () => {
    const res = await ops({ command: 'superadmin-list', args: {} }, { token: null, ip: '7.7.7.1' });
    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await json(res);
    expect(body).toEqual({ error: { code: 'NO_AUTORIZADO', message: 'No autorizado' } });

    const audit = await lastAudit();
    expect(audit.action).toBe('OPS_AUTH_FAILED');
    expect(audit.ip).toBe('7.7.7.1');
    expect(audit.superadmin_id).toBeNull();
  });

  it('token incorrecto → 401 idéntico y OPS_AUTH_FAILED sin el token en la bitácora', async () => {
    const wrong = `${OPS_TOKEN.slice(0, -1)}x`;
    const res = await ops({ command: 'superadmin-list', args: {} }, { token: wrong });
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ error: { code: 'NO_AUTORIZADO', message: 'No autorizado' } });

    // Otras formas del header tampoco pasan: otro esquema, token de otro largo, vacío.
    for (const header of [`Basic ${OPS_TOKEN}`, `Bearer ${OPS_TOKEN}extra`, 'Bearer ', OPS_TOKEN]) {
      const r = await SELF.fetch(`${ADMIN_ORIGIN}/internal/ops`, {
        method: 'POST',
        headers: {
          Authorization: header,
          'Content-Type': 'application/json',
          'CF-Connecting-IP': nextIp(),
        },
        body: JSON.stringify({ command: 'superadmin-list', args: {} }),
      });
      expect(r.status, header).toBe(401);
    }

    const audit = await lastAudit();
    expect(audit.action).toBe('OPS_AUTH_FAILED');
    const all = JSON.stringify(await opsAudit());
    expect(all).not.toContain(wrong);
    expect(all).not.toContain(OPS_TOKEN);
  });

  it('desde el host de un negocio → 404 aunque el token sea válido, y no se registra', async () => {
    await createTestTenant('ops-host');
    const before = (await opsAudit()).length;
    const res = await ops(
      { command: 'superadmin-list', args: {} },
      { url: tenantUrl('ops-host', '/internal/ops') },
    );
    expect(res.status).toBe(404);
    expect((await opsAudit()).length).toBe(before);
  });

  it('sin OPS_TOKEN configurado (o uno corto) → 404 igual que una ruta que no existe', async () => {
    const request = () =>
      new Request(`${ADMIN_ORIGIN}/internal/ops`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ', 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'superadmin-list', args: {} }),
      });
    const results = await inPlatform(async () => {
      const app = createPlatformApp();
      const out: { status: number; body: unknown }[] = [];
      for (const token of [undefined, '', 'corto']) {
        const res = await app.fetch(request(), { ...env, OPS_TOKEN: token });
        out.push({ status: res.status, body: await res.json() });
      }
      const missing = await app.fetch(new Request(`${ADMIN_ORIGIN}/internal/nada`), env);
      out.push({ status: missing.status, body: await missing.json() });
      return out;
    });
    for (const r of results) {
      expect(r).toEqual({
        status: 404,
        body: { error: { code: 'NO_ENCONTRADO', message: 'Ruta no encontrada' } },
      });
    }
  });

  it('las llamadas con el token correcto no cuentan para el límite', async () => {
    const ip = '7.7.7.3';
    for (let i = 0; i < 15; i++) {
      expect((await ops({ command: 'superadmin-list', args: {} }, { ip })).status).toBe(200);
    }
  });

  it('10 fallos de token cada 15 min por IP; después 429 aunque el token sea correcto', async () => {
    const ip = '7.7.7.2';
    for (let i = 0; i < 10; i++) {
      const res = await ops(
        { command: 'superadmin-list', args: {} },
        { ip, token: i % 2 ? null : 'token-incorrecto' },
      );
      expect(res.status).toBe(401);
    }
    const blocked = await ops({ command: 'superadmin-list', args: {} }, { ip });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    expect((await ops({ command: 'superadmin-list', args: {} })).status).toBe(200);
  });

  it('cuerpo inválido → 400 y queda registrado', async () => {
    const unknown = await ops({ command: 'borrar-todo', args: {} });
    expect(unknown.status).toBe(400);
    expect((await json(unknown)).error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await lastAudit()).action).toBe('OPS_INVALID_REQUEST');

    const badArgs = await ops({ command: 'superadmin-create', args: { username: 'X' } });
    expect(badArgs.status).toBe(400);
    const audit = await lastAudit();
    expect(audit.action).toBe('OPS_SUPERADMIN_CREATE');
    expect(JSON.parse(audit.payload!)).toMatchObject({ ok: false, error: 'VALIDATION_ERROR' });

    // Argumentos de más (un error de tipeo en la consola) no se ignoran.
    const extra = await ops({ command: 'tenant-list', args: { slug: 'x' } });
    expect(extra.status).toBe(400);
    expect((await ops('no es json')).status).toBe(400);
  });
});

describe('/internal/ops: superadministradores', () => {
  it('superadmin-create da una contraseña temporal que abre el panel; no se repite', async () => {
    const { tempPassword } = await opsOk<{ tempPassword: string }>('superadmin-create', {
      username: 'Ops-Uno',
    });
    expect(tempPassword).toHaveLength(24);

    const res = await platformLogin('ops-uno', tempPassword);
    expect(res.status).toBe(200);

    const audit = await lastAudit();
    expect(audit.action).toBe('OPS_SUPERADMIN_CREATE');
    expect(JSON.parse(audit.payload!)).toEqual({ ok: true, username: 'ops-uno' });
    expect(audit.payload).not.toContain(tempPassword);

    const dup = await ops({ command: 'superadmin-create', args: { username: 'ops-uno' } });
    expect(dup.status).toBe(409);
    expect((await json(dup)).error).toMatchObject({ code: 'SUPERADMIN_YA_EXISTE' });
  });

  it('superadmin-reset cambia la contraseña y cierra sus sesiones', async () => {
    await createSuperadmin('ops-dos', PASSWORD);
    const token = platformToken(await platformLogin('ops-dos', PASSWORD))!;

    const { tempPassword } = await opsOk<{ tempPassword: string }>('superadmin-reset', {
      username: 'ops-dos',
    });
    expect((await platformCall('GET', '/platform/auth/me', { token })).status).toBe(401);
    expect((await platformLogin('ops-dos', PASSWORD)).status).toBe(401);
    expect((await platformLogin('ops-dos', tempPassword)).status).toBe(200);
    expect(JSON.stringify(await opsAudit())).not.toContain(tempPassword);

    const missing = await ops({ command: 'superadmin-reset', args: { username: 'nadie' } });
    expect(missing.status).toBe(404);
    expect((await json(missing)).error).toMatchObject({ code: 'SUPERADMIN_NO_ENCONTRADO' });
  });

  it('superadmin-disable cierra sesiones y bloquea el acceso; enable lo devuelve; list sin hashes', async () => {
    await createSuperadmin('ops-tres', PASSWORD);
    const token = platformToken(await platformLogin('ops-tres', PASSWORD))!;

    await opsOk('superadmin-disable', { username: 'ops-tres' });
    expect((await platformCall('GET', '/platform/auth/me', { token })).status).toBe(401);
    expect((await platformLogin('ops-tres', PASSWORD)).status).toBe(401);

    const { superadmins } = await opsOk<{ superadmins: Record<string, unknown>[] }>(
      'superadmin-list',
    );
    expect(superadmins.find((a) => a.username === 'ops-tres')).toMatchObject({
      active: false,
      locked: false,
    });
    expect(JSON.stringify(superadmins)).not.toContain('argon2id');

    await opsOk('superadmin-enable', { username: 'ops-tres' });
    expect((await platformLogin('ops-tres', PASSWORD)).status).toBe(200);
  });
});

describe('/internal/ops: negocios', () => {
  it('tenant-create (tipo genérico) + código que activa al dueño; list, suspend y activate', async () => {
    const { setupCode } = await opsOk<{ setupCode: string }>('tenant-create', {
      slug: 'ops-tienda',
      name: 'Tienda de Ops',
    });
    expect(setupCode).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    expect((await tenantStub('ops-tienda').platformSummary())?.template).toBe('generico');
    expect(JSON.stringify(await opsAudit())).not.toContain(setupCode);

    const setup = await call('ops-tienda', 'POST', '/auth/setup', {
      body: {
        setupCode,
        username: 'dueno',
        displayName: 'Ana',
        password: PASSWORD,
        confirmPassword: PASSWORD,
      },
    });
    expect(setup.status, await setup.clone().text()).toBe(201);

    const { tenants } = await opsOk<{ tenants: { slug: string; name: string; status: string }[] }>(
      'tenant-list',
    );
    expect(tenants.find((t) => t.slug === 'ops-tienda')).toMatchObject({
      name: 'Tienda de Ops',
      status: 'active',
    });

    await opsOk('tenant-suspend', { slug: 'ops-tienda' });
    expect(await platformStub().resolveTenant('ops-tienda')).toEqual({ status: 'suspended' });
    await opsOk('tenant-activate', { slug: 'ops-tienda' });
    expect(await platformStub().resolveTenant('ops-tienda')).toEqual({ status: 'active' });

    const dup = await ops({ command: 'tenant-create', args: { slug: 'ops-tienda', name: 'X' } });
    expect(dup.status).toBe(409);
    const reserved = await ops({ command: 'tenant-create', args: { slug: 'admin', name: 'X' } });
    expect(reserved.status).toBe(400);
    const missing = await ops({ command: 'tenant-suspend', args: { slug: 'no-existe' } });
    expect(missing.status).toBe(404);
  });

  it('setup-code emite un código nuevo mientras no haya dueño', async () => {
    await createTestTenant('ops-codigo');
    const { setupCode } = await opsOk<{ setupCode: string }>('setup-code', { slug: 'ops-codigo' });
    const setup = await call('ops-codigo', 'POST', '/auth/setup', {
      body: {
        setupCode,
        username: 'dueno',
        displayName: 'Ana',
        password: PASSWORD,
        confirmPassword: PASSWORD,
      },
    });
    expect(setup.status).toBe(201);
    const again = await ops({ command: 'setup-code', args: { slug: 'ops-codigo' } });
    expect(again.status).toBe(409);
    expect((await json(again)).error).toMatchObject({ code: 'NEGOCIO_YA_ACTIVADO' });
  });

  it('reset-owner invalida la sesión vieja del dueño y la contraseña temporal entra', async () => {
    await createTestTenant('ops-dueno', { owner: { username: 'dueno', password: PASSWORD } });
    const oldToken = await loginToken('ops-dueno', 'dueno', PASSWORD);
    expect((await call('ops-dueno', 'GET', '/auth/me', { token: oldToken })).status).toBe(200);

    const result = await opsOk<{ username: string; tempPassword: string; recoveryCode: string }>(
      'reset-owner',
      { slug: 'ops-dueno' },
    );
    expect(result.username).toBe('dueno');
    expect(result.recoveryCode).toMatch(/^[0-9a-f]{32}$/);

    expect((await call('ops-dueno', 'GET', '/auth/me', { token: oldToken })).status).toBe(401);
    expect((await login('ops-dueno', 'dueno', PASSWORD)).status).toBe(401);
    const res = await login('ops-dueno', 'dueno', result.tempPassword);
    expect(res.status).toBe(200);
    expect(sessionToken(res)).toBeTruthy();

    const audit = JSON.stringify(await opsAudit());
    expect(audit).not.toContain(result.tempPassword);
    expect(audit).not.toContain(result.recoveryCode);
    expect((await lastAudit()).tenant_slug).toBe('ops-dueno');

    await createTestTenant('ops-sin-dueno');
    const noOwner = await ops({ command: 'reset-owner', args: { slug: 'ops-sin-dueno' } });
    expect(noOwner.status).toBe(409);
    expect((await json(noOwner)).error).toMatchObject({ code: 'NEGOCIO_NO_ACTIVADO' });
    expect((await ops({ command: 'reset-owner', args: { slug: 'no-existe' } })).status).toBe(404);
  });
});

describe('/internal/ops: recuperación a un punto en el tiempo', () => {
  type PitrStorage = { onNextSessionRestoreBookmark?: (b: string) => Promise<string> };
  // En workerd el objeto storage sobrevive al reinicio del DO: se quita el doble al terminar.
  const patched: string[] = [];
  afterEach(async () => {
    for (const slug of patched.splice(0)) {
      await runInDurableObject(tenantStub(slug), (_i, state) => {
        delete (state.storage as unknown as PitrStorage).onNextSessionRestoreBookmark;
      });
    }
  });

  it('bookmarks lista los pre-migración y el actual', async () => {
    await createTestTenant('ops-bm');
    await runInDurableObject(tenantStub('ops-bm'), (_i, state) => {
      state.storage.kv.put('pre-migracion:0011_x', '0000000a-0000000b-0000000c-0d');
    });
    const result = await opsOk<{ current: string; preMigration: unknown[] }>('bookmarks', {
      slug: 'ops-bm',
    });
    expect(typeof result.current).toBe('string');
    expect(result.preMigration).toEqual([
      { tag: '0011_x', bookmark: '0000000a-0000000b-0000000c-0d' },
    ]);
    expect((await ops({ command: 'bookmarks', args: { slug: 'no-existe' } })).status).toBe(404);
  });

  // El runtime local no implementa PITR (onNextSessionRestoreBookmark lanza "does not implement
  // point-in-time recovery"), así que la restauración real no se puede probar aquí. Se prueba lo
  // que sí: que el DO recibe ese bookmark, que se reinicia, y que un fallo no lo toca.
  it('restore-tenant programa la restauración con ese bookmark y reinicia el DO', async () => {
    await createTestTenant('ops-pitr');
    const seen: string[] = [];
    await runInDurableObject(tenantStub('ops-pitr'), (instance, state) => {
      (instance as unknown as { marker: number }).marker = 1;
      (state.storage as unknown as PitrStorage).onNextSessionRestoreBookmark = async (b) => {
        seen.push(b);
        return 'ffffffff-ffffffff-ffffffff-ff';
      };
    });
    patched.push('ops-pitr');

    const bookmark = '0000007b-0000b26e-00001538-0c3e87bb37b3db5cc52eedb93cd3b96b';
    const result = await opsOk<{ restored: boolean; undoBookmark: string }>('restore-tenant', {
      slug: 'ops-pitr',
      bookmark,
    });
    expect(result.restored).toBe(true);
    expect(typeof result.undoBookmark).toBe('string');
    expect(seen).toEqual([bookmark]);

    // El DO se reinició: la instancia en memoria es otra.
    const marker = await runInDurableObject(
      tenantStub('ops-pitr'),
      (instance) => (instance as unknown as { marker?: number }).marker,
    );
    expect(marker).toBeUndefined();
    const audit = await lastAudit();
    expect(audit.action).toBe('OPS_RESTORE_TENANT');
    expect(JSON.parse(audit.payload!)).toMatchObject({ ok: true, slug: 'ops-pitr', bookmark });
  });

  it('si la restauración no se puede programar responde error y el negocio sigue igual', async () => {
    await createTestTenant('ops-pitr-local', { owner: { username: 'dueno', password: PASSWORD } });
    const token = await loginToken('ops-pitr-local', 'dueno', PASSWORD);
    await runInDurableObject(tenantStub('ops-pitr-local'), (instance) => {
      (instance as unknown as { marker: number }).marker = 2;
    });

    // Sin doble: el runtime local rechaza la restauración, como lo haría un bookmark inválido.
    const res = await ops({
      command: 'restore-tenant',
      args: { slug: 'ops-pitr-local', bookmark: '00000000-00000000-00000000-00' },
    });
    expect(res.status).toBe(422);
    expect((await json(res)).error).toMatchObject({ code: 'RESTAURACION_NO_PROGRAMADA' });

    const marker = await runInDurableObject(
      tenantStub('ops-pitr-local'),
      (instance) => (instance as unknown as { marker?: number }).marker,
    );
    expect(marker).toBe(2);
    expect((await call('ops-pitr-local', 'GET', '/auth/me', { token })).status).toBe(200);
  });

  it('restore-tenant valida el negocio y el formato del bookmark', async () => {
    const missing = await ops({
      command: 'restore-tenant',
      args: { slug: 'no-existe', bookmark: '00000000-00' },
    });
    expect(missing.status).toBe(404);
    expect(await inPlatform(() => findTenant('no-existe'))).toBeNull();

    await createTestTenant('ops-pitr-fmt');
    for (const bookmark of ['', 'x; DROP', '../a', 'a'.repeat(200)]) {
      const res = await ops({
        command: 'restore-tenant',
        args: { slug: 'ops-pitr-fmt', bookmark },
      });
      expect(res.status, bookmark).toBe(400);
    }
  });
});
