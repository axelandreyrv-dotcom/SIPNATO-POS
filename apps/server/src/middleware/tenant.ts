import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { enterTenantContext, openTenantDb } from '../db/client.js';
import { findTenant } from '../db/control.js';

declare module 'fastify' {
  interface FastifyRequest {
    tenantSlug: string | null;
  }
}

// Rutas que no pertenecen a ningún negocio.
const GLOBAL_PATHS = new Set(['/health', '/internal/tls-check']);

// "taller.dosuxsoft.com" → "taller". Solo un label exacto: "a.b.dosuxsoft.com" no es un negocio.
export function slugFromHostname(hostname: string, baseDomain: string): string | null {
  const host = hostname.toLowerCase();
  const suffix = `.${baseDomain.toLowerCase()}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  return label && !label.includes('.') ? label : null;
}

function resolveSlug(request: FastifyRequest): string | null {
  const fromHost = slugFromHostname(request.hostname, config.TENANT_BASE_DOMAIN);
  if (fromHost) return fromHost;
  if (config.NODE_ENV === 'development' && config.DEV_TENANT) return config.DEV_TENANT;
  return null;
}

export function registerTenantResolution(app: FastifyInstance): void {
  app.decorateRequest('tenantSlug', null);

  // Hook estilo callback a propósito: AsyncLocalStorage.run debe envolver `done`
  // para que el contexto del negocio se propague a los hooks y al handler siguientes.
  app.addHook('onRequest', (request, reply, done) => {
    const path = request.url.split('?')[0] ?? '';
    if (GLOBAL_PATHS.has(path)) return done();

    const slug = resolveSlug(request);
    const tenant = slug ? findTenant(slug) : null;

    if (!tenant) {
      void reply.status(404).send({ error: { code: 'NEGOCIO_NO_ENCONTRADO', message: 'Negocio no encontrado' } });
      return;
    }
    if (tenant.status !== 'active') {
      void reply.status(403).send({ error: { code: 'NEGOCIO_SUSPENDIDO', message: 'Este negocio está suspendido' } });
      return;
    }

    request.tenantSlug = tenant.slug;
    request.log = request.log.child({ tenant: tenant.slug });
    enterTenantContext(openTenantDb(tenant.slug), done);
  });
}
