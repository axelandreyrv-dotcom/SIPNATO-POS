import type { Env } from './env.js';

export { TenantDO } from './do/tenant-do.js';
export { PlatformDO } from './do/platform-do.js';

const PLATFORM_LABEL = 'admin';

export default {
  async fetch(request, env): Promise<Response> {
    const host = new URL(request.url).hostname;
    const label = host.split('.')[0] ?? '';
    if (label === PLATFORM_LABEL) {
      return env.PLATFORM.get(env.PLATFORM.idFromName(PLATFORM_LABEL)).fetch(request);
    }
    const headers = new Headers(request.headers);
    headers.set('X-Dosuxsoft-Tenant', label);
    return env.TENANT.get(env.TENANT.idFromName(label)).fetch(new Request(request, { headers }));
  },
  async scheduled(): Promise<void> {},
} satisfies ExportedHandler<Env>;
