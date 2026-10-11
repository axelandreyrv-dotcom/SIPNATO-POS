import { env, evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  controlDb,
  insertTenant,
  runInPlatform,
  saveExchangeRate,
  setTenantStatus,
} from '../db/control.js';
import { importLegacyControl, LEGACY_IMPORT_FLAG } from '../db/legacy-platform.js';
import { PlatformDO } from '../do/platform-do.js';
import { hashPassword } from '../lib/crypto.js';
import { legacyPlatform } from '../lib/platform-client.js';
import { insertPlatformAudit, insertSuperadmin } from '../modules/platform/repository.js';
import {
  call,
  GENERIC_ASSIGNMENT,
  inPlatform,
  platformCall,
  platformLogin,
  platformStub,
  platformToken,
  tenantStub,
} from './helpers.js';

const PWD = 'clave-antigua-123';

// Escribe en el objeto de la plataforma original (el que nació en Singapur).
function inLegacy<T>(fn: () => T | Promise<T>): Promise<T> {
  return runInDurableObject(legacyPlatform(env), (_i, state) => runInPlatform(state.storage, fn));
}

const flag = () =>
  runInDurableObject(platformStub(), (_i, state) => state.storage.kv.get(LEGACY_IMPORT_FLAG));

afterEach(() => vi.restoreAllMocks());

describe('migración de la plataforma al objeto nuevo', () => {
  it('copia una sola vez superadministradores, negocios, ajustes, bitácora y tipo de cambio; nunca sesiones', async () => {
    const hash = await hashPassword(PWD);
    // Un negocio suspendido creado por la plataforma anterior: su DO no tiene el estado guardado.
    await tenantStub('leg-suspendida').initialize('leg-suspendida', GENERIC_ASSIGNMENT);
    await runInDurableObject(tenantStub('leg-suspendida'), (_i, state) => {
      state.storage.kv.delete('status');
    });
    expect((await call('leg-suspendida', 'GET', '/auth/status')).status).toBe(200);
    const legacyId = await inLegacy(() => {
      insertSuperadmin('antiguo', hash);
      controlDb
        .prepare("INSERT INTO platform_settings (key, value) VALUES ('default_monthly_price', ?)")
        .run('17500');
      insertPlatformAudit({
        action: 'PLATFORM_LOGIN',
        superadminId: 1,
        meta: { ip: '1.2.3.4', userAgent: 'antes' },
      });
      insertTenant('leg-tienda', 'Tienda antigua');
      insertTenant('leg-suspendida', 'Suspendida');
      setTenantStatus('leg-suspendida', 'suspended');
      controlDb
        .prepare(
          "UPDATE tenants SET setup_code_hash = 'hash-del-codigo', paid_until = '2026-11-10' WHERE slug = 'leg-tienda'",
        )
        .run();
      controlDb
        .prepare(
          `INSERT INTO subscription_payments (tenant_slug, amount, months, method, paid_at, period_from, period_to, created_at)
           VALUES ('leg-tienda', 15000, 1, 'sinpe', '2026-10-10', '2026-10-11', '2026-11-10', '2026-10-10')`,
        )
        .run();
      saveExchangeRate('2026-10-10', 50523, 51100);
      const id = controlDb
        .prepare<[], { id: number }>("SELECT id FROM superadmins WHERE username = 'antiguo'")
        .get()!.id;
      controlDb
        .prepare(
          `INSERT INTO platform_sessions (id, superadmin_id, token_hash, expires_at, last_active_at, created_at)
           VALUES ('p-legacy', ?, 'h-legacy', '2099-01-01', '2099-01-01', '2026-10-10')`,
        )
        .run(id);
      return id;
    });

    // Falla cerrado: mientras el objeto viejo no responde, el nuevo no atiende ni escribe nada
    // (ni la bitácora de un login), y lo reintenta en la próxima petición.
    const caido = vi.spyOn(PlatformDO.prototype, 'exportLegacyControl').mockImplementation(() => {
      throw new Error('objeto viejo caído');
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const blocked = await platformLogin('antiguo', 'clave-equivocada');
    expect(blocked.status).toBeGreaterThanOrEqual(500);
    await blocked.text();
    const health = await platformCall('GET', '/health');
    expect(health.status).toBeGreaterThanOrEqual(500);
    await health.text();
    expect(caido).toHaveBeenCalled();
    caido.mockRestore();
    logged.mockRestore();

    // El primer arranque que sí logra leer el objeto viejo trae los datos antes de atender.
    const login = await platformLogin('antiguo', PWD);
    expect(login.status).toBe(200);
    await login.text(); // con el cuerpo sin leer la petición sigue abierta y evictDurableObject espera
    expect(await flag()).toBe(true);

    const token = platformToken(login)!;
    const settings = (await (
      await platformCall('GET', '/platform/settings', { token })
    ).json()) as {
      defaultMonthlyPrice: number;
    };
    expect(settings.defaultMonthlyPrice).toBe(17500);

    const copied = await inPlatform(() => ({
      superadminId: controlDb
        .prepare<[], { id: number }>("SELECT id FROM superadmins WHERE username = 'antiguo'")
        .get()?.id,
      audit: controlDb
        .prepare<[], { action: string; ip: string }>('SELECT action, ip FROM platform_audit_log')
        .all(),
      tenants: controlDb
        .prepare<
          [],
          { slug: string; setup_code_hash: string; paid_until: string }
        >("SELECT slug, setup_code_hash, paid_until FROM tenants WHERE slug = 'leg-tienda'")
        .all(),
      payments: controlDb
        .prepare<
          [],
          { tenant_slug: string; amount: number }
        >('SELECT tenant_slug, amount FROM subscription_payments')
        .all(),
      rates: controlDb.prepare<[], { date: string }>('SELECT date FROM exchange_rates').all(),
      sessions: controlDb.prepare<[], { id: string }>('SELECT id FROM platform_sessions').all(),
    }));
    expect(copied.superadminId).toBe(legacyId);
    expect(copied.audit).toContainEqual({ action: 'PLATFORM_LOGIN', ip: '1.2.3.4' });
    // Solo el login de antes (copiado) y el de ahora: nada quedó del intento mientras fallaba.
    expect(copied.audit.map((a) => a.action)).toEqual(['PLATFORM_LOGIN', 'PLATFORM_LOGIN']);
    expect(copied.tenants).toEqual([
      { slug: 'leg-tienda', setup_code_hash: 'hash-del-codigo', paid_until: '2026-11-10' },
    ]);
    expect(copied.payments).toEqual([{ tenant_slug: 'leg-tienda', amount: 15000 }]);
    const list = (await (await platformCall('GET', '/platform/tenants', { token })).json()) as {
      tenants: { slug: string; paidUntil: string }[];
    };
    expect(list.tenants.find((t) => t.slug === 'leg-tienda')).toMatchObject({
      paidUntil: '2026-11-10',
    });
    expect(list.tenants.map((t) => t.slug).sort()).toEqual(['leg-suspendida', 'leg-tienda']);

    // Después de copiar, la plataforma le avisa a cada negocio su estado.
    await vi.waitFor(async () =>
      expect((await call('leg-suspendida', 'GET', '/auth/status')).status).toBe(403),
    );
    expect(copied.rates).toEqual([{ date: '2026-10-10' }]);
    expect(copied.sessions.map((s) => s.id)).not.toContain('p-legacy');

    // Un segundo arranque no vuelve a importar.
    const tardio = await hashPassword(PWD);
    await inLegacy(() => insertSuperadmin('tardio', tardio));
    await evictDurableObject(platformStub());
    expect((await platformLogin('tardio', PWD)).status).toBe(401);
    expect((await platformLogin('antiguo', PWD)).status).toBe(200);
  }, 20_000);
});

describe('importLegacyControl', () => {
  // Un objeto de plataforma aparte, vaciado a mano: como uno que aún no se migró.
  const scratch = () => env.PLATFORM.get(env.PLATFORM.idFromName('pruebas-importacion'));

  function resetScratch(state: DurableObjectState) {
    state.storage.kv.delete(LEGACY_IMPORT_FLAG);
    runInPlatform(state.storage, () => {
      for (const table of [
        'platform_sessions',
        'subscription_payments',
        'platform_audit_log',
        'superadmins',
        'tenants',
        'platform_settings',
        'exchange_rates',
      ]) {
        controlDb.exec(`DELETE FROM ${table}`);
      }
    });
  }

  it('si el objeto viejo no responde lanza (el arranque falla cerrado), no marca nada y lo registra', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runInDurableObject(scratch(), async (_i, state) => {
      resetScratch(state);
      const outcome = await importLegacyControl(state.storage, () =>
        Promise.reject(new Error('caído')),
      ).then(
        () => 'resolvió',
        (err: Error) => err.message,
      );
      return { outcome, flag: state.storage.kv.get(LEGACY_IMPORT_FLAG) };
    });
    expect(result.outcome).toContain('caído');
    expect(result.flag).toBeUndefined();
    expect(error).toHaveBeenCalled();
  });

  it('si el objeto viejo tarda más que el límite, lanza sin marcar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runInDurableObject(scratch(), async (_i, state) => {
      resetScratch(state);
      const outcome = await importLegacyControl(
        state.storage,
        () => new Promise<never>(() => {}),
        50,
      ).then(
        () => 'resolvió',
        (err: Error) => err.message,
      );
      return { outcome, flag: state.storage.kv.get(LEGACY_IMPORT_FLAG) };
    });
    expect(result.outcome).toContain('50 ms');
    expect(result.flag).toBeUndefined();
  });

  it('importa aunque el objeto nuevo ya tenga el tipo de cambio del día o un ajuste', async () => {
    const result = await runInDurableObject(scratch(), async (_i, state) => {
      resetScratch(state);
      runInPlatform(state.storage, () => {
        saveExchangeRate('2026-10-11', 50000, 51000);
        controlDb
          .prepare(
            "INSERT INTO platform_settings (key, value) VALUES ('default_monthly_price', '9000')",
          )
          .run();
      });
      const outcome = await importLegacyControl(state.storage, () =>
        Promise.resolve({
          superadmins: [
            {
              id: 7,
              username: 'copiado',
              password_hash: 'h',
              active: 1,
              failed_attempts: 0,
              locked_until: null,
              created_at: '2026-10-01',
            },
          ],
          platform_settings: [{ key: 'default_monthly_price', value: '17500' }],
          exchange_rates: [
            { date: '2026-10-11', buy: 49000, sell: 50000, fetched_at: '2026-10-11T00:00:00Z' },
          ],
        }),
      );
      return {
        outcome,
        flag: state.storage.kv.get(LEGACY_IMPORT_FLAG),
        admins: runInPlatform(state.storage, () =>
          controlDb.prepare<[], { id: number }>('SELECT id FROM superadmins').all(),
        ),
      };
    });
    expect(result).toEqual({ outcome: 'imported', flag: true, admins: [{ id: 7 }] });
  });

  it('un objeto viejo vacío solo deja la marca', async () => {
    const result = await runInDurableObject(scratch(), async (_i, state) => {
      resetScratch(state);
      const outcome = await importLegacyControl(state.storage, () => Promise.resolve({}));
      return { outcome, flag: state.storage.kv.get(LEGACY_IMPORT_FLAG) };
    });
    expect(result).toEqual({ outcome: 'empty', flag: true });
  });

  it('con la marca puesta o con datos propios no le pregunta al objeto viejo', async () => {
    const fetchLegacy = vi.fn(() => Promise.resolve({}));
    const outcomes = await runInDurableObject(scratch(), async (_i, state) => {
      resetScratch(state);
      state.storage.kv.put(LEGACY_IMPORT_FLAG, true);
      const withFlag = await importLegacyControl(state.storage, fetchLegacy);

      resetScratch(state);
      runInPlatform(state.storage, () => insertSuperadmin('propio', 'hash'));
      const withData = await importLegacyControl(state.storage, fetchLegacy);
      return { withFlag, withData, flag: state.storage.kv.get(LEGACY_IMPORT_FLAG) };
    });
    expect(outcomes).toEqual({ withFlag: 'done', withData: 'skipped', flag: true });
    expect(fetchLegacy).not.toHaveBeenCalled();
  });
});
