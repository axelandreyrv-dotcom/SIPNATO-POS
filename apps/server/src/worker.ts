import { isValidSlug, PLATFORM_SUBDOMAIN } from '@sipnato/shared';
import type { TenantStatus } from './db/control.js';
import type { Env } from './env.js';
import { TENANT_HEADER } from './lib/constants.js';
import { AppError, NegocioNoEncontrado, NegocioSuspendido } from './lib/errors.js';
import { errorResponse } from './lib/http.js';
import { platform } from './lib/platform-client.js';

export { TenantDO } from './do/tenant-do.js';
export { PlatformDO } from './do/platform-do.js';

export type HostRoute = { kind: 'platform' } | { kind: 'tenant'; slug: string } | null;

// Lo mismo que `assets.run_worker_first` en wrangler.jsonc: cualquier otra ruta la sirven los
// Static Assets (la SPA) sin pasar por aquí. Si se agrega un prefijo, va en los dos lados.
const API_PREFIXES = ['/api/', '/auth/', '/platform/', '/internal/'];
const API_PATHS = ['/health'];

// Lo único que atiende el panel (admin.<dominio>).
const PLATFORM_PREFIX = '/platform/';
const PLATFORM_PATHS = ['/internal/ops', '/health'];

// Rutas que un negocio nunca atiende: la API del panel y las operaciones internas.
const TENANT_FORBIDDEN_PREFIXES = ['/platform/', '/internal/'];

const DEV_HOSTNAMES = ['localhost', '127.0.0.1'];

// Cuánto se recuerda el estado de un negocio en este isolate: suspender rige a más tardar en ese
// tiempo, y a cambio la mayoría de las peticiones no le pregunta a la plataforma.
const RESOLVE_TTL_MS = 30_000;

const notFound = () => errorResponse(new AppError('NO_ENCONTRADO', 'Ruta no encontrada', 404));

const isApiPath = (path: string) =>
  API_PATHS.includes(path) || API_PREFIXES.some((prefix) => path.startsWith(prefix));

// "Taller.dosuxsoft.com:443" → negocio "taller". Exactamente un label antes del dominio base, y
// que sea un slug válido y no reservado: nunca se llega a un Durable Object con otro nombre.
export function routeHost(host: string, env: Env): HostRoute {
  const hostname = host.trim().toLowerCase().replace(/:\d+$/, '');

  if (env.ENVIRONMENT === 'development' && DEV_HOSTNAMES.includes(hostname)) {
    const slug = env.DEV_TENANT;
    return slug && isValidSlug(slug) ? { kind: 'tenant', slug } : null;
  }

  const suffix = `.${env.TENANT_BASE_DOMAIN.toLowerCase()}`;
  if (!hostname.endsWith(suffix)) return null;
  const label = hostname.slice(0, -suffix.length);
  if (label === PLATFORM_SUBDOMAIN) return { kind: 'platform' };
  // El regex del slug no admite puntos: "a.b.dosuxsoft.com" y "../x" quedan fuera.
  return isValidSlug(label) ? { kind: 'tenant', slug: label } : null;
}

// En producción el Host es el de la URL (Cloudflare la arma con él). Solo en desarrollo se acepta
// X-Forwarded-Host, que pone el proxy de Vite: en producción permitiría elegir negocio con un header.
function requestHost(request: Request, env: Env): string {
  if (env.ENVIRONMENT === 'development') {
    const forwarded = request.headers.get('X-Forwarded-Host')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }
  return new URL(request.url).host;
}

// Solo se guardan negocios que existen: el tamaño queda acotado por la cantidad de negocios (un
// subdominio inventado no ocupa memoria) y uno recién creado responde de inmediato.
const resolved = new Map<string, { status: TenantStatus; expiresAt: number }>();

async function tenantStatus(slug: string, env: Env): Promise<TenantStatus | null> {
  const now = Date.now();
  const cached = resolved.get(slug);
  if (cached && cached.expiresAt > now) return cached.status;

  const tenant = await platform(env).resolveTenant(slug);
  if (!tenant) {
    resolved.delete(slug);
    return null;
  }
  resolved.set(slug, { status: tenant.status, expiresAt: now + RESOLVE_TTL_MS });
  return tenant.status;
}

// Solo para tests: cada caso empieza sin estados recordados.
export function clearTenantCache(): void {
  resolved.clear();
}

async function routeApi(request: Request, path: string, env: Env): Promise<Response> {
  const route = routeHost(requestHost(request, env), env);
  if (!route) return errorResponse(new NegocioNoEncontrado());

  // El header del negocio solo lo pone este Worker; el que mande el cliente nunca pasa.
  const headers = new Headers(request.headers);
  headers.delete(TENANT_HEADER);

  if (route.kind === 'platform') {
    if (!path.startsWith(PLATFORM_PREFIX) && !PLATFORM_PATHS.includes(path)) return notFound();
    return platform(env).fetch(new Request(request, { headers }));
  }

  if (TENANT_FORBIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix))) return notFound();

  // Antes de tocar el Durable Object: un slug que la plataforma no conoce nunca crea uno.
  const status = await tenantStatus(route.slug, env);
  if (status === null) return errorResponse(new NegocioNoEncontrado());
  if (status !== 'active') return errorResponse(new NegocioSuspendido());

  headers.set(TENANT_HEADER, route.slug);
  const stub = env.TENANT.get(env.TENANT.idFromName(route.slug));
  return stub.fetch(new Request(request, { headers }));
}

export default {
  async fetch(request, env): Promise<Response> {
    const path = new URL(request.url).pathname;
    // En producción estas rutas no llegan aquí (las sirven los Static Assets); sí en tests.
    if (!isApiPath(path)) return env.ASSETS.fetch(request);

    try {
      return await routeApi(request, path, env);
    } catch (err) {
      console.error('Error no controlado en el enrutador', err);
      return errorResponse(new AppError('ERROR_INTERNO', 'Error interno del servidor', 500));
    }
  },
  async scheduled(): Promise<void> {},
} satisfies ExportedHandler<Env>;
