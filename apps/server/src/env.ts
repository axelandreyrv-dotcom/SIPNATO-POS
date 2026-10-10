import type { TenantDO } from './do/tenant-do.js';
import type { PlatformDO } from './do/platform-do.js';

export interface Env {
  TENANT: DurableObjectNamespace<TenantDO>;
  PLATFORM: DurableObjectNamespace<PlatformDO>;
  ASSETS: Fetcher;
  BACKUPS: R2Bucket;
  TENANT_BASE_DOMAIN: string;
  ENVIRONMENT: 'production' | 'development' | 'test';
  DEV_TENANT?: string;
  BCCR_API_TOKEN?: string;
  OPS_TOKEN?: string;
}

type WorkerEnv = Env; // alias: dentro del namespace `Env` apunta a Cloudflare.Env

// Tipa `env` de `cloudflare:workers` y `cloudflare:test` con los bindings del Worker.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cloudflare {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Env extends WorkerEnv {}
  }
}
