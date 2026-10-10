import type { Env } from './env.js';
import { TENANT_HEADER } from './lib/constants.js';
import { platform } from './lib/platform-client.js';

export { TenantDO } from './do/tenant-do.js';
export { PlatformDO } from './do/platform-do.js';

const PLATFORM_LABEL = 'admin';

export default {
  async fetch(request, env): Promise<Response> {
    const host = new URL(request.url).hostname;
    const label = host.split('.')[0] ?? '';
    if (label === PLATFORM_LABEL) {
      return platform(env).fetch(request);
    }
    const headers = new Headers(request.headers);
    headers.set(TENANT_HEADER, label);
    return env.TENANT.get(env.TENANT.idFromName(label)).fetch(new Request(request, { headers }));
  },
  async scheduled(): Promise<void> {},
} satisfies ExportedHandler<Env>;
