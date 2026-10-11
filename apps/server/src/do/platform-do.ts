import { DurableObject } from 'cloudflare:workers';
import type { SubscriptionInfo } from '@sipnato/shared';
import type { Hono } from 'hono';
import {
  findTenant,
  initControlSchema,
  latestExchangeRate,
  listActiveTenants,
  listTenants,
  runInPlatform,
  type ExchangeRateRow,
  type TenantStatus,
} from '../db/control.js';
import type { Env } from '../env.js';
import { todayCR } from '../lib/cr-time.js';
import { exportTenant } from '../lib/export.js';
import type { AppEnv } from '../lib/http.js';
import { sweepRateLimits } from '../lib/rate-limit.js';
import { INACTIVITY_TIMEOUT_MS } from '../lib/session.js';
import { deleteExpiredPlatformSessions } from '../modules/platform/repository.js';
import {
  consumeSetupCode,
  refreshExchangeRate,
  tenantSubscriptionInfo,
} from '../modules/platform/service.js';
import { createPlatformApp } from '../platform-app.js';

// Las sesiones del panel (hashes de tokens) no sirven para restaurar y solo exponen.
const CONTROL_EXPORT_EXCLUDED = ['platform_sessions'];

// El panel del superadministrador y el registro de negocios (control.db). Los negocios le
// preguntan por RPC; nunca leen sus tablas.
export class PlatformDO extends DurableObject<Env> {
  private readonly app: Hono<AppEnv>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    runInPlatform(ctx.storage, initControlSchema);
    this.app = createPlatformApp();
  }

  private run<T>(fn: () => T): T {
    return runInPlatform(this.ctx.storage, fn);
  }

  override async fetch(request: Request): Promise<Response> {
    return this.run(() => this.app.fetch(request, this.env));
  }

  resolveTenant(slug: string): { status: TenantStatus } | null {
    return this.run(() => {
      const tenant = findTenant(slug);
      return tenant && { status: tenant.status };
    });
  }

  consumeSetupCode(slug: string, code: string): Promise<boolean> {
    return this.run(() => consumeSetupCode(slug, code));
  }

  subscriptionInfo(slug: string): SubscriptionInfo | null {
    return this.run(() => tenantSubscriptionInfo(slug));
  }

  latestExchangeRate(): ExchangeRateRow | null {
    return this.run(latestExchangeRate);
  }

  refreshExchangeRate(): Promise<void> {
    return this.run(() => refreshExchangeRate(this.env.BCCR_API_TOKEN));
  }

  listActiveSlugs(): string[] {
    return this.run(() => listActiveTenants().map((t) => t.slug));
  }

  // Los que reciben el mantenimiento diario. Un suspendido también: conserva sus datos (puede
  // reactivarse) y sin esto se quedaría sin respaldos nuevos y con sesiones viejas.
  listMaintainedSlugs(): string[] {
    const maintained: TenantStatus[] = ['active', 'suspended'];
    return this.run(() =>
      listTenants()
        .filter((t) => maintained.includes(t.status))
        .map((t) => t.slug),
    );
  }

  exportControl(): ReturnType<typeof exportTenant> {
    return exportTenant(this.ctx.storage, CONTROL_EXPORT_EXCLUDED);
  }

  // Lo llama el cron diario antes que el de los negocios: limpieza y respaldo de control.db en R2.
  async dailyMaintenance(): Promise<void> {
    this.run(() =>
      deleteExpiredPlatformSessions(new Date(Date.now() - INACTIVITY_TIMEOUT_MS).toISOString()),
    );
    sweepRateLimits(this.ctx.storage.kv);
    await this.env.BACKUPS.put(`_control/${todayCR()}.json`, JSON.stringify(this.exportControl()), {
      httpMetadata: { contentType: 'application/json' },
    });
  }
}
