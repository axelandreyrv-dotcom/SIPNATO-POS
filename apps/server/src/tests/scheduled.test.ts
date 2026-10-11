import {
  createExecutionContext,
  createScheduledController,
  env,
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../db/client.js';
import { controlDb, insertTenant, latestExchangeRate, setTenantStatus } from '../db/control.js';
import { cashRegisters, sessions } from '../db/schema.js';
import { openCashRegister } from '../modules/cash-registers/service.js';
import { setAllSettings } from '../modules/settings/repository.js';
import { AUTO_CLOSE_KEY, nextAutoCloseAt } from '../lib/auto-close.js';
import { todayCR } from '../lib/cr-time.js';
import worker from '../worker.js';
import {
  call,
  createSuperadmin,
  createTestTenant,
  inPlatform,
  inTenant,
  loginToken,
  platformLogin,
  tenantStub,
  type Method,
} from './helpers.js';

const PWD = 'clave-dueno-1';
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const HOURLY = '15 * * * *';
const DAILY = '0 9 * * *';

const at = (iso: string) => new Date(iso);

async function runCron(cron: string): Promise<void> {
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ cron }), env, ctx);
  await waitOnExecutionContext(ctx);
}

const alarmOf = (slug: string) =>
  runInDurableObject(tenantStub(slug), (_i, state) => state.storage.getAlarm());

const pendingOf = (slug: string) =>
  runInDurableObject(tenantStub(slug), (_i, state) => state.storage.kv.get<string>(AUTO_CLOSE_KEY));

const registersOf = (slug: string) => inTenant(slug, () => db.select().from(cashRegisters).all());

// "HH:MM" de Costa Rica (UTC−6) dentro de `offsetMs`: una hora lejos de ahora, para que ninguna
// alarma real se dispare a mitad de un test.
function crTimeIn(offsetMs: number): string {
  const d = new Date(Date.now() - 6 * HOUR + offsetMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

async function ownerApi(slug: string) {
  await createTestTenant(slug, { owner: { username: 'dueno', password: PWD } });
  const token = await loginToken(slug, 'dueno', PWD);
  return (method: Method, path: string, body?: unknown) =>
    call(slug, method, path, { token, body });
}

async function setAutoClose(
  api: Awaited<ReturnType<typeof ownerApi>>,
  enabled: boolean,
  time: string,
): Promise<void> {
  const settings = (await (await api('GET', '/api/settings')).json()) as Record<string, unknown>;
  const res = await api('PUT', '/api/settings', {
    ...settings,
    auto_close_enabled: enabled,
    auto_close_time: time,
  });
  expect(res.status).toBe(200);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('nextAutoCloseAt (hora de Costa Rica, UTC−6)', () => {
  it('antes de la hora → hoy; después → mañana', () => {
    // 09:00 CR del 10 de octubre
    const now = at('2026-10-10T15:00:00.000Z');
    expect(nextAutoCloseAt(now, '18:30').toISOString()).toBe('2026-10-11T00:30:00.000Z');
    expect(nextAutoCloseAt(now, '08:00').toISOString()).toBe('2026-10-11T14:00:00.000Z');
  });

  it('estrictamente después de now: la hora exacta pasa a mañana', () => {
    const now = at('2026-10-10T15:00:00.000Z');
    expect(nextAutoCloseAt(now, '09:00').toISOString()).toBe('2026-10-11T15:00:00.000Z');
  });

  it('cruza la medianoche UTC: el día que cuenta es el de Costa Rica', () => {
    // 21:00 CR del 10 (03:00 UTC del 11): las 22:00 de hoy en CR son las 04:00 UTC del 11.
    expect(nextAutoCloseAt(at('2026-10-11T03:00:00.000Z'), '22:00').toISOString()).toBe(
      '2026-10-11T04:00:00.000Z',
    );
    // 23:00 CR del 10 (05:00 UTC del 11): las 00:30 son del 11 en CR.
    expect(nextAutoCloseAt(at('2026-10-11T05:00:00.000Z'), '00:30').toISOString()).toBe(
      '2026-10-11T06:30:00.000Z',
    );
    // 23:59 CR del 31 de diciembre: el 00:00 siguiente es del año nuevo.
    expect(nextAutoCloseAt(at('2027-01-01T05:59:00.000Z'), '00:00').toISOString()).toBe(
      '2027-01-01T06:00:00.000Z',
    );
  });
});

describe('cierre automático con la alarma del negocio', () => {
  it('activarlo programa la alarma a la próxima hora; desactivarlo la borra', async () => {
    const api = await ownerApi('cierre-prog');
    expect(await alarmOf('cierre-prog')).toBeNull();

    const time = crTimeIn(6 * HOUR);
    await setAutoClose(api, true, time);
    const expected = nextAutoCloseAt(new Date(), time).getTime();
    expect(await alarmOf('cierre-prog')).toBe(expected);
    expect(await pendingOf('cierre-prog')).toBe(new Date(expected).toISOString());

    await setAutoClose(api, false, time);
    expect(await alarmOf('cierre-prog')).toBeNull();
    expect(await pendingOf('cierre-prog')).toBeUndefined();
  });

  it('con caja abierta cierra con closedAt = hora programada aunque la alarma llegue tarde', async () => {
    const api = await ownerApi('cierre-caja');
    await setAutoClose(api, true, crTimeIn(6 * HOUR));
    expect((await api('POST', '/api/cash-registers/open', { openingAmount: 5000 })).status).toBe(
      201,
    );
    const scheduled = (await alarmOf('cierre-caja'))!;

    // La alarma corre 10 minutos tarde.
    vi.spyOn(Date, 'now').mockReturnValue(scheduled + 10 * 60_000);
    expect(await runDurableObjectAlarm(tenantStub('cierre-caja'))).toBe(true);

    const [register] = await registersOf('cierre-caja');
    expect(register).toMatchObject({
      closedAt: new Date(scheduled).toISOString(),
      closeType: 'auto',
    });
    // Queda programada la del día siguiente.
    expect(await alarmOf('cierre-caja')).toBe(scheduled + DAY);
  });

  it('sin caja abierta no hace nada y se reprograma', async () => {
    const api = await ownerApi('cierre-vacia');
    await setAutoClose(api, true, crTimeIn(6 * HOUR));
    const scheduled = (await alarmOf('cierre-vacia'))!;

    vi.spyOn(Date, 'now').mockReturnValue(scheduled + 1000);
    expect(await runDurableObjectAlarm(tenantStub('cierre-vacia'))).toBe(true);

    expect(await registersOf('cierre-vacia')).toEqual([]);
    expect(await alarmOf('cierre-vacia')).toBe(scheduled + DAY);
  });

  it('una caja abierta después de la hora programada no se cierra', async () => {
    const api = await ownerApi('cierre-tarde');
    await setAutoClose(api, true, crTimeIn(6 * HOUR));
    expect((await api('POST', '/api/cash-registers/open', { openingAmount: 0 })).status).toBe(201);
    const scheduled = (await alarmOf('cierre-tarde'))!;
    await inTenant('cierre-tarde', () =>
      db
        .update(cashRegisters)
        .set({ openedAt: new Date(scheduled + 60_000).toISOString() })
        .run(),
    );

    vi.spyOn(Date, 'now').mockReturnValue(scheduled + 5 * 60_000);
    await runDurableObjectAlarm(tenantStub('cierre-tarde'));
    const [register] = await registersOf('cierre-tarde');
    expect(register?.closedAt).toBeNull();
  });

  it('una alarma que corre antes de su hora no cierra: espera a la hora programada', async () => {
    const api = await ownerApi('cierre-antes');
    await setAutoClose(api, true, crTimeIn(6 * HOUR));
    expect((await api('POST', '/api/cash-registers/open', { openingAmount: 0 })).status).toBe(201);
    const scheduled = (await alarmOf('cierre-antes'))!;

    await runDurableObjectAlarm(tenantStub('cierre-antes'));
    const [register] = await registersOf('cierre-antes');
    expect(register?.closedAt).toBeNull();
    expect(await alarmOf('cierre-antes')).toBe(scheduled);
  });

  // Sin pasar por HTTP: evictDurableObject espera a que terminen las peticiones en curso, y una
  // respuesta cuyo cuerpo nadie leyó cuenta como en curso.
  async function enableDirect(slug: string, withRegister: boolean): Promise<number> {
    await createTestTenant(slug);
    const time = crTimeIn(6 * HOUR);
    await inTenant(slug, () => {
      setAllSettings(
        [
          ['auto_close_enabled', 'true'],
          ['auto_close_time', time],
        ],
        { payloadSnapshot: '{}', ip: null, userAgent: null },
      );
      if (withRegister) openCashRegister(0, { ip: null, userAgent: null });
    });
    await tenantStub(slug).scheduleAutoClose();
    const scheduled = await alarmOf(slug);
    expect(scheduled).toBe(nextAutoCloseAt(new Date(), time).getTime());
    await runInDurableObject(tenantStub(slug), (_i, state) => state.storage.deleteAlarm());
    return scheduled!;
  }

  it('al despertar, el DO vuelve a programar la alarma si se perdió', async () => {
    const scheduled = await enableDirect('cierre-despierta', false);
    await evictDurableObject(tenantStub('cierre-despierta'));
    expect(await alarmOf('cierre-despierta')).toBe(scheduled);
  });

  it('una alarma vencida que no alcanzó a correr se respeta al despertar', async () => {
    const scheduled = await enableDirect('cierre-vencida', true);

    // El DO se despierta pasada la hora: no salta al día siguiente, cierra con la hora pendiente.
    vi.spyOn(Date, 'now').mockReturnValue(scheduled + HOUR);
    await evictDurableObject(tenantStub('cierre-vencida'));
    expect(await alarmOf('cierre-vencida')).toBe(scheduled + HOUR);
    await runDurableObjectAlarm(tenantStub('cierre-vencida'));

    const [register] = await registersOf('cierre-vencida');
    expect(register?.closedAt).toBe(new Date(scheduled).toISOString());
    expect(await alarmOf('cierre-vencida')).toBe(scheduled + DAY);
  });

  it('un DO nunca inicializado no programa nada ni crea tablas', async () => {
    const stub = tenantStub('cierre-fantasma');
    await stub.scheduleAutoClose();
    expect(await alarmOf('cierre-fantasma')).toBeNull();
    const tables = await runInDurableObject(stub, (_i, state) =>
      state.storage.sql
        .exec(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*'",
        )
        .toArray(),
    );
    expect(tables).toEqual([]);
  });
});

describe('cron horario: tipo de cambio del BCCR', () => {
  it('guarda el tipo del día consultando el BCCR (simulado)', async () => {
    const today = todayCR();
    await inPlatform(() =>
      controlDb.prepare('DELETE FROM exchange_rates WHERE date = ?').run(today),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const code = String(input).includes('/317/') ? '317' : '318';
      return Response.json({
        estado: true,
        datos: [
          {
            codigoIndicador: code,
            series: [
              { fecha: `${today}T00:00:00`, valorDatoPorPeriodo: code === '317' ? 508.1 : 514.2 },
            ],
          },
        ],
      });
    });

    await runCron(HOURLY);
    expect(fetchSpy).toHaveBeenCalled();
    expect(String(fetchSpy.mock.calls[0]?.[0])).toMatch(/^https:\/\/apim\.bccr\.fi\.cr\//);
    expect(await inPlatform(latestExchangeRate)).toMatchObject({
      date: today,
      buy: 50_810,
      sell: 51_420,
    });
  });
});

describe('cron diario: mantenimiento y respaldos en R2', () => {
  const today = () => todayCR();
  const tenantKey = (slug: string) => `tenants/${slug}/${today()}.json`;
  const readJson = async (key: string) =>
    (await (await env.BACKUPS.get(key))!.json()) as { tables: Record<string, unknown[]> };

  beforeAll(async () => {
    for (const slug of ['diario-a', 'diario-b', 'diario-susp']) {
      const api = await ownerApi(slug);
      expect((await api('POST', '/api/cash-registers/open', { openingAmount: 0 })).status).toBe(
        201,
      );
      expect(
        (
          await api('POST', '/api/sales', {
            description: `venta de ${slug}`,
            amount: 1000,
            paymentMethod: 'sinpe',
          })
        ).status,
      ).toBe(201);
    }
    await inPlatform(() => setTenantStatus('diario-susp', 'suspended'));
    await createSuperadmin('raiz', 'clave-raiz-123');
    expect((await platformLogin('raiz', 'clave-raiz-123')).status).toBe(200);
  });

  it('deja un respaldo por negocio activo, ninguno del suspendido, y el de la plataforma', async () => {
    await runCron(DAILY);

    const a = await readJson(tenantKey('diario-a'));
    expect(JSON.stringify(a.tables['sales'])).toContain('venta de diario-a');
    expect(JSON.stringify(a)).not.toContain('venta de diario-b');
    expect(await env.BACKUPS.head(tenantKey('diario-b'))).not.toBeNull();
    expect(await env.BACKUPS.head(tenantKey('diario-susp'))).toBeNull();
    const susp = await env.BACKUPS.list({ prefix: 'tenants/diario-susp/' });
    expect(susp.objects).toEqual([]);

    const head = await env.BACKUPS.head(tenantKey('diario-a'));
    expect(head?.httpMetadata?.contentType).toBe('application/json');

    const control = await readJson(`_control/${today()}.json`);
    expect(Object.keys(control.tables)).toContain('tenants');
    expect(Object.keys(control.tables)).toContain('superadmins');
  });

  it('los respaldos no llevan sesiones', async () => {
    await runCron(DAILY);
    const a = await readJson(tenantKey('diario-a'));
    expect(Object.keys(a.tables)).not.toContain('sessions');
    expect(Object.keys(a.tables)).toContain('users');
    const control = await readJson(`_control/${today()}.json`);
    expect(Object.keys(control.tables)).not.toContain('platform_sessions');
  });

  it('borra sesiones vencidas o inactivas y claves viejas del rate limit', async () => {
    const now = Date.now();
    const old = new Date(now - 2 * DAY).toISOString();
    await inTenant('diario-a', () => {
      const userId = db.select().from(sessions).get()!.userId;
      db.insert(sessions)
        .values([
          // vencida por duración
          { id: 's-vencida', userId, tokenHash: 'h1', expiresAt: old, lastActiveAt: old },
          // inactiva más de 60 min, aunque su duración no haya terminado
          {
            id: 's-inactiva',
            userId,
            tokenHash: 'h2',
            expiresAt: new Date(now + HOUR).toISOString(),
            lastActiveAt: new Date(now - 2 * HOUR).toISOString(),
          },
        ])
        .run();
    });
    const putRl = (state: DurableObjectState) => {
      state.storage.kv.put('rl:login:9.9.9.9', { start: now - 2 * DAY, count: 3 });
      state.storage.kv.put('rl:login:8.8.8.8', { start: now - 10 * 60_000, count: 1 });
    };
    await runInDurableObject(tenantStub('diario-a'), (_i, state) => putRl(state));
    await runInDurableObject(env.PLATFORM.get(env.PLATFORM.idFromName('platform')), (_i, state) =>
      putRl(state),
    );
    await inPlatform(() =>
      controlDb
        .prepare(
          `INSERT INTO platform_sessions (id, superadmin_id, token_hash, expires_at, last_active_at, created_at)
           SELECT 'p-vencida', id, 'hp', ?, ?, ? FROM superadmins LIMIT 1`,
        )
        .run(old, old, old),
    );

    await runCron(DAILY);

    const ids = await inTenant('diario-a', () =>
      db
        .select({ id: sessions.id })
        .from(sessions)
        .all()
        .map((s) => s.id),
    );
    expect(ids).not.toContain('s-vencida');
    expect(ids).not.toContain('s-inactiva');
    expect(ids.length).toBeGreaterThan(0); // la sesión vigente del dueño sigue

    const rlKeys = (state: DurableObjectState) =>
      [...state.storage.kv.list({ prefix: 'rl:' })].map(([k]) => k);
    const tenantRl = await runInDurableObject(tenantStub('diario-a'), (_i, s) => rlKeys(s));
    expect(tenantRl).not.toContain('rl:login:9.9.9.9');
    expect(tenantRl).toContain('rl:login:8.8.8.8');
    const platformRl = await runInDurableObject(
      env.PLATFORM.get(env.PLATFORM.idFromName('platform')),
      (_i, s) => rlKeys(s),
    );
    expect(platformRl).not.toContain('rl:login:9.9.9.9');
    expect(platformRl).toContain('rl:login:8.8.8.8');

    const platformSessions = await inPlatform(() =>
      controlDb.prepare<[], { id: string }>('SELECT id FROM platform_sessions').all(),
    );
    expect(platformSessions.map((s) => s.id)).not.toContain('p-vencida');
    expect(platformSessions.length).toBeGreaterThan(0);
  });

  it('un negocio que falla se registra con su slug y no frena el respaldo de los demás', async () => {
    // Registrado y activo en la plataforma, pero su DO nunca se inicializó: su mantenimiento falla.
    // (En stderr queda una línea "Uncaught (in promise)" de ese rechazo: la produce el envoltorio
    // del plugin de vitest alrededor de los métodos RPC del DO, igual que en http.test.ts.)
    await inPlatform(() => insertTenant('diario-roto', 'Roto'));
    await env.BACKUPS.delete([tenantKey('diario-a'), tenantKey('diario-b')]);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runCron(DAILY);

    expect(await env.BACKUPS.head(tenantKey('diario-a'))).not.toBeNull();
    expect(await env.BACKUPS.head(tenantKey('diario-b'))).not.toBeNull();
    expect(await env.BACKUPS.head(tenantKey('diario-roto'))).toBeNull();
    expect(error.mock.calls.some((args) => String(args[0]).includes('diario-roto'))).toBe(true);
    // el DO roto sigue vacío
    expect(await tenantStub('diario-roto').platformSummary()).toBeNull();
  });
});
