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
