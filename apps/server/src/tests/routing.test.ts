import { env, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env.js';
import { TENANT_HEADER } from '../lib/constants.js';
import worker, { routeHost } from '../worker.js';
import {
  call,
  createTestTenant,
  login,
  platformCall,
  setTestTenantStatus,
  tenantStub,
} from './helpers.js';

const PWD = 'clave-dueno-1';

const errorOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string; message: string } }).error;

// Los headers de §6.6 que llevan las respuestas de la API (la CSP es de las páginas).
function expectApiHeaders(res: Response) {
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  expect(res.headers.get('Strict-Transport-Security')).toBe(
    'max-age=63072000; includeSubDomains; preload',
  );
  expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  expect(res.headers.get('Content-Type')).toMatch(/^application\/json/);
}

// Un namespace que anota cada uso antes de delegar en el real: si queda vacío, el Worker no
// pidió ni creó ningún Durable Object. `forwarded` guarda las peticiones que llegaron al DO.
function spyNamespace<T extends Rpc.DurableObjectBranded>(real: DurableObjectNamespace<T>) {
  const names: string[] = [];
  const forwarded: Request[] = [];
  const options: (DurableObjectNamespaceGetDurableObjectOptions | undefined)[] = [];
  const ns = {
    idFromName(name: string) {
      names.push(name);
      return real.idFromName(name);
    },
    get(id: DurableObjectId, opts?: DurableObjectNamespaceGetDurableObjectOptions) {
      options.push(opts);
      const stub = real.get(id, opts);
      return new Proxy(stub, {
        get(target, prop) {
          if (prop === 'fetch') {
            return (req: Request) => {
              forwarded.push(req.clone());
              return target.fetch(req);
            };
          }
          // Las propiedades de un stub son llamadas RPC (`bind` incluido): se reenvían tal cual.
          if (prop === 'then' || typeof prop !== 'string') return undefined;
          return (...args: unknown[]) =>
            (target as unknown as Record<string, (...a: unknown[]) => unknown>)[prop]!(...args);
        },
      });
    },
  } as unknown as DurableObjectNamespace<T>;
  return { ns, names, forwarded, options };
}

interface Spy {
  names: string[];
  forwarded: Request[];
  options: (DurableObjectNamespaceGetDurableObjectOptions | undefined)[];
}

interface Harness {
  tenant: Spy;
  platform: Spy;
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

// Llama directo al `fetch` del Worker con namespaces espía (y el entorno que se pida).
function harness(vars: Partial<Env> = {}): Harness {
  const tenant = spyNamespace(env.TENANT);
  const platform = spyNamespace(env.PLATFORM);
  const testEnv: Env = { ...env, ...vars, TENANT: tenant.ns, PLATFORM: platform.ns } as Env;
  return {
    tenant,
    platform,
    fetch: (url, init) =>
      worker.fetch(
        new Request(url, init) as Request<unknown, IncomingRequestCfProperties>,
        testEnv,
      ),
  };
}

const PROD = { ENVIRONMENT: 'production', TENANT_BASE_DOMAIN: 'dosuxsoft.com' } as const;
const DEV = {
  ENVIRONMENT: 'development',
  TENANT_BASE_DOMAIN: 'localhost',
  DEV_TENANT: 'rt-dev',
} as const;

// Un negocio registrado en la plataforma, con DO inicializado y dueño.
async function activeTenant(slug: string) {
  await createTestTenant(slug, { owner: { username: 'dueno', password: PWD } });
}

beforeAll(async () => {
  await activeTenant('rt-a');
  await createTestTenant('rt-b'); // sin dueño: /auth/status → { setup: false }
  await activeTenant('rt-dev');
});

afterEach(() => vi.restoreAllMocks());

describe('routeHost', () => {
  const prod = { ...env, ...PROD } as Env;
  const dev = { ...env, ...DEV } as Env;

  it('un label antes del dominio base es el negocio; admin es la plataforma', () => {
    expect(routeHost('taller.dosuxsoft.com', prod)).toEqual({ kind: 'tenant', slug: 'taller' });
    expect(routeHost('Taller.DosuxSoft.com:443', prod)).toEqual({ kind: 'tenant', slug: 'taller' });
    expect(routeHost('admin.dosuxsoft.com', prod)).toEqual({ kind: 'platform' });
  });

  it.each([
    'evil.com',
    'dosuxsoft.com',
    'a.b.dosuxsoft.com',
    'www.dosuxsoft.com',
    'api.dosuxsoft.com',
    'app.dosuxsoft.com',
    'mail.dosuxsoft.com',
    'static.dosuxsoft.com',
    'assets.dosuxsoft.com',
    'control.dosuxsoft.com',
    '../x.dosuxsoft.com',
    '..dosuxsoft.com',
    '.dosuxsoft.com',
    '-x.dosuxsoft.com',
    'taller.dosuxsoft.com.evil.com',
    'tallerdosuxsoft.com',
    'localhost',
    'taller.localhost',
    '',
  ])('%s no es un negocio en producción', (host) => {
    expect(routeHost(host, prod)).toBeNull();
  });

  it('en desarrollo: localhost y 127.0.0.1 → DEV_TENANT; <slug>.localhost y admin.localhost', () => {
    expect(routeHost('localhost:8787', dev)).toEqual({ kind: 'tenant', slug: 'rt-dev' });
    expect(routeHost('127.0.0.1', dev)).toEqual({ kind: 'tenant', slug: 'rt-dev' });
    expect(routeHost('taller.localhost:5174', dev)).toEqual({ kind: 'tenant', slug: 'taller' });
    expect(routeHost('admin.localhost', dev)).toEqual({ kind: 'platform' });
    expect(routeHost('localhost', { ...dev, DEV_TENANT: '' } as Env)).toBeNull();
    expect(routeHost('localhost', { ...dev, DEV_TENANT: 'www' } as Env)).toBeNull();
  });
});

describe('enrutado por Host sin tocar Durable Objects', () => {
  it.each([
    'evil.com',
    'a.b.dosuxsoft.com',
    'www.dosuxsoft.com',
    'api.dosuxsoft.com',
    '../x.dosuxsoft.com',
    'dosuxsoft.com',
    'a.rt-a.dosuxsoft.com',
    '..dosuxsoft.com',
  ])('Host %s → 404 sin crear DO', async (host) => {
    // En producción el Host llega como la URL de la petición.
    let parsed: string | null = null;
    try {
      parsed = new URL(`https://${host}/auth/status`).hostname;
    } catch {
      // no es un hostname válido: Cloudflare no lo entregaría como URL
    }
    if (parsed === host) {
      const h = harness(PROD);
      const res = await h.fetch(`https://${host}/auth/status`);
      expect(res.status).toBe(404);
      expect((await errorOf(res)).code).toBe('NEGOCIO_NO_ENCONTRADO');
      expect(h.tenant.names).toEqual([]);
      expect(h.platform.names).toEqual([]);
    }

    // En desarrollo el texto crudo de X-Forwarded-Host llega a routeHost.
    const dev = harness({ ...DEV, TENANT_BASE_DOMAIN: 'dosuxsoft.com', DEV_TENANT: '' });
    const res = await dev.fetch('http://127.0.0.1:8787/auth/status', {
      headers: { 'X-Forwarded-Host': host },
    });
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe('NEGOCIO_NO_ENCONTRADO');
    expect(dev.tenant.names).toEqual([]);
    expect(dev.platform.names).toEqual([]);
  });

  it('un subdominio válido sin negocio → 404 de su DO, sin preguntar a la plataforma y sin datos', async () => {
    const h = harness(PROD);
    const res = await h.fetch('https://rt-nadie.dosuxsoft.com/auth/status');
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe('NEGOCIO_NO_ENCONTRADO');
    expectApiHeaders(res);
    expect(res.headers.get('Content-Security-Policy')).toBeNull();
    expect(h.platform.names).toEqual([]);
    expect(h.tenant.names).toEqual(['rt-nadie']);
    const storage = await runInDurableObject(tenantStub('rt-nadie'), (_i, state) => ({
      kv: [...state.storage.kv.list()].length,
      tables: state.storage.sql
        .exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB '_cf_*'")
        .toArray().length,
    }));
    expect(storage).toEqual({ kv: 0, tables: 0 });
  });

  it('un negocio activo no le pregunta a la plataforma', async () => {
    const h = harness(PROD);
    const res = await h.fetch('https://rt-a.dosuxsoft.com/auth/status');
    expect(res.status).toBe(200);
    expect(h.platform.names).toEqual([]);
  });

  it('un negocio activo sí llega a su DO (el espía funciona)', async () => {
    const h = harness(PROD);
    const res = await h.fetch('https://rt-a.dosuxsoft.com/auth/status');
    expect(await res.json()).toEqual({ setup: true });
    expect(h.tenant.names).toEqual(['rt-a']);
  });

  it('los Durable Objects se piden en el este de Norteamérica; la plataforma con su nombre nuevo', async () => {
    const h = harness(PROD);
    await h.fetch('https://rt-a.dosuxsoft.com/auth/status');
    expect(h.tenant.options).toEqual([{ locationHint: 'enam' }]);

    const p = harness(PROD);
    await p.fetch('https://admin.dosuxsoft.com/health');
    expect(p.platform.names).toEqual(['platform-enam']);
    expect(p.platform.options).toEqual([{ locationHint: 'enam' }]);
  });

  it('negocio suspendido → 403 desde su DO, sin preguntar a la plataforma', async () => {
    await createTestTenant('rt-susp-x');
    await setTestTenantStatus('rt-susp-x', 'suspended');
    const h = harness(PROD);
    const res = await h.fetch('https://rt-susp-x.dosuxsoft.com/auth/status');
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe('NEGOCIO_SUSPENDIDO');
    expectApiHeaders(res);
    expect(res.headers.get('Content-Security-Policy')).toBeNull();
    expect(h.platform.names).toEqual([]);
  });

  it('un negocio inicializado sin estado guardado (creado antes de este cambio) atiende normal', async () => {
    await createTestTenant('rt-sin-estado', { owner: { username: 'dueno', password: PWD } });
    await runInDurableObject(tenantStub('rt-sin-estado'), (_i, state) => {
      state.storage.kv.delete('status');
    });
    const res = await call('rt-sin-estado', 'GET', '/auth/status');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ setup: true });
    expect((await login('rt-sin-estado', 'dueno', PWD)).status).toBe(200);
  });
});

describe('headers que manda el cliente', () => {
  it('en producción X-Forwarded-Host: otro.dosuxsoft.com no cambia el negocio', async () => {
    const res = await call('rt-a', 'GET', '/auth/status', {
      headers: { 'X-Forwarded-Host': 'rt-b.dosuxsoft.com' },
    });
    expect(await res.json()).toEqual({ setup: true }); // rt-a, no rt-b

    const h = harness(PROD);
    await h.fetch('https://rt-a.dosuxsoft.com/auth/status', {
      headers: { 'X-Forwarded-Host': 'rt-b.dosuxsoft.com' },
    });
    expect(h.tenant.names).toEqual(['rt-a']);
  });

  it('en desarrollo X-Forwarded-Host sí elige el negocio (proxy de Vite)', async () => {
    const h = harness(DEV);
    const res = await h.fetch('http://localhost:8787/auth/status', {
      headers: { 'X-Forwarded-Host': 'rt-b.localhost:5174' },
    });
    expect(await res.json()).toEqual({ setup: false });
    expect(h.tenant.names).toEqual(['rt-b']);

    const sinHeader = harness(DEV);
    expect(await (await sinHeader.fetch('http://localhost:8787/auth/status')).json()).toEqual({
      setup: true,
    });
    expect(sinHeader.tenant.names).toEqual(['rt-dev']);
  });

  it('en desarrollo X-Forwarded-Host solo cuenta si la URL es local', async () => {
    // Un Worker de desarrollo que por error quedara publicado en el dominio real.
    const h = harness({ ...DEV, TENANT_BASE_DOMAIN: 'dosuxsoft.com' });
    const res = await h.fetch('https://rt-a.dosuxsoft.com/auth/status', {
      headers: { 'X-Forwarded-Host': 'rt-b.dosuxsoft.com' },
    });
    expect(await res.json()).toEqual({ setup: true }); // rt-a, no rt-b
    expect(h.tenant.names).toEqual(['rt-a']);

    for (const local of ['http://127.0.0.1:8787', 'http://dev.localhost:8787']) {
      const l = harness({ ...DEV, TENANT_BASE_DOMAIN: 'dosuxsoft.com' });
      await l.fetch(`${local}/auth/status`, {
        headers: { 'X-Forwarded-Host': 'rt-b.dosuxsoft.com' },
      });
      expect(l.tenant.names, local).toEqual(['rt-b']);
    }
  });

  it('X-Dosuxsoft-Tenant enviado por el cliente se descarta', async () => {
    const res = await call('rt-a', 'GET', '/auth/status', {
      headers: { [TENANT_HEADER]: 'rt-b' },
    });
    expect(await res.json()).toEqual({ setup: true });

    const h = harness(PROD);
    await h.fetch('https://rt-a.dosuxsoft.com/auth/status', {
      headers: { 'x-dosuxsoft-tenant': 'rt-b' },
    });
    expect(h.tenant.forwarded).toHaveLength(1);
    expect(h.tenant.forwarded[0]!.headers.get(TENANT_HEADER)).toBe('rt-a');

    const p = harness(PROD);
    await p.fetch('https://admin.dosuxsoft.com/health', { headers: { [TENANT_HEADER]: 'rt-a' } });
    expect(p.platform.forwarded).toHaveLength(1);
    expect(p.platform.forwarded[0]!.headers.get(TENANT_HEADER)).toBeNull();
  });
});

describe('estado del negocio', () => {
  it('negocio suspendido → 403; inexistente → 404', async () => {
    await createTestTenant('rt-susp');
    await setTestTenantStatus('rt-susp', 'suspended');

    const suspendido = await call('rt-susp', 'GET', '/auth/status');
    expect(suspendido.status).toBe(403);
    expect((await errorOf(suspendido)).code).toBe('NEGOCIO_SUSPENDIDO');
    expectApiHeaders(suspendido);

    const inexistente = await call('rt-no-existe', 'GET', '/auth/status');
    expect(inexistente.status).toBe(404);
    expect((await errorOf(inexistente)).code).toBe('NEGOCIO_NO_ENCONTRADO');
    expectApiHeaders(inexistente);
  });

  it('suspender y reactivar rigen de inmediato', async () => {
    await createTestTenant('rt-cache');
    const h = harness(PROD);
    const url = 'https://rt-cache.dosuxsoft.com/auth/status';
    expect((await h.fetch(url)).status).toBe(200);

    await setTestTenantStatus('rt-cache', 'suspended');
    expect((await h.fetch(url)).status).toBe(403);

    await setTestTenantStatus('rt-cache', 'active');
    expect((await h.fetch(url)).status).toBe(200);
  });

  it('un negocio recién creado responde de inmediato', async () => {
    const h = harness(PROD);
    const url = 'https://rt-nuevo.dosuxsoft.com/auth/status';
    expect((await h.fetch(url)).status).toBe(404);
    await createTestTenant('rt-nuevo');
    expect((await h.fetch(url)).status).toBe(200);
  });

  it('el DO de un subdominio inventado queda sin datos', async () => {
    await call('rt-inventado', 'GET', '/auth/status');
    expect(await tenantStub('rt-inventado').platformSummary()).toBeNull();
  });
});

describe('rutas de API, plataforma y SPA', () => {
  it('GET /caja → index.html; GET /api/no-existe → 404 JSON; /platform/tenants desde un negocio → 404', async () => {
    const caja = await call('rt-a', 'GET', '/caja');
    expect(caja.status).toBe(200);
    expect(await caja.text()).toContain('fixture');

    const noExiste = await call('rt-a', 'GET', '/api/no-existe');
    expect(noExiste.status).toBe(404);
    expect((await errorOf(noExiste)).code).toBe('NO_ENCONTRADO');
    expectApiHeaders(noExiste);

    for (const path of ['/platform/tenants', '/platform/auth/me', '/internal/ops']) {
      const res = await call('rt-a', 'GET', path);
      expect(res.status, path).toBe(404);
      expect((await errorOf(res)).code).toBe('NO_ENCONTRADO');
      expectApiHeaders(res);
    }
  });

  it('las páginas del SPA no dependen del negocio (un subdominio inventado también recibe la SPA)', async () => {
    const res = await call('rt-nadie', 'GET', '/login');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('fixture');
  });

  it('el panel solo atiende /platform/*, /internal/ops y /health; el resto de la API → 404', async () => {
    for (const path of ['/api/sales', '/auth/me', '/auth/status', '/internal/otra']) {
      const h = harness(PROD);
      const res = await h.fetch(`https://admin.dosuxsoft.com${path}`);
      expect(res.status, path).toBe(404);
      expect((await errorOf(res)).code).toBe('NO_ENCONTRADO');
      expectApiHeaders(res);
      expect(h.platform.forwarded, path).toHaveLength(0);
      expect(h.tenant.names).toEqual([]);
    }
    for (const path of ['/platform/auth/me', '/internal/ops', '/health']) {
      const h = harness(PROD);
      await h.fetch(`https://admin.dosuxsoft.com${path}`);
      expect(h.platform.forwarded, path).toHaveLength(1);
      expect(h.tenant.names).toEqual([]);
    }
    expect((await platformCall('GET', '/health')).status).toBe(200);
    const spa = await platformCall('GET', '/negocios');
    expect(spa.status).toBe(200);
    expect(await spa.text()).toContain('fixture');
  });

  it('/health solo existe en el panel', async () => {
    const res = await call('rt-a', 'GET', '/health');
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe('NO_ENCONTRADO');
    expectApiHeaders(res);
    // Se rechaza en el Worker, como /platform/* e /internal/*: no llega al DO del negocio.
    const t = harness(PROD);
    expect((await t.fetch('https://rt-a.dosuxsoft.com/health')).status).toBe(404);
    expect(t.tenant.names).toEqual([]);
    const h = harness(PROD);
    const sinNegocio = await h.fetch('https://dosuxsoft.com/health');
    expect((await errorOf(sinNegocio)).code).toBe('NEGOCIO_NO_ENCONTRADO');
  });

  it('un error al llegar al Durable Object → 500 genérico, sin detalles', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const testEnv = {
      ...env,
      ...PROD,
      TENANT: {
        idFromName: () => {
          throw new Error('detalle interno');
        },
      },
    } as unknown as Env;
    const res = await worker.fetch(
      new Request('https://rt-a.dosuxsoft.com/auth/status') as Request<
        unknown,
        IncomingRequestCfProperties
      >,
      testEnv,
    );
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('detalle interno');
    expect(JSON.parse(body)).toEqual({
      error: { code: 'ERROR_INTERNO', message: 'Error interno del servidor' },
    });
    expectApiHeaders(res);
    expect(logged).toHaveBeenCalled();
  });
});
