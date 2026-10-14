import { DurableObject } from 'cloudflare:workers';
import type { SubscriptionInfo } from '@dosuxsoft/shared';
import type { Hono } from 'hono';
import {
  initControlSchema,
  latestExchangeRate,
  listActiveTenants,
  listTenants,
  runInPlatform,
  type ExchangeRateRow,
  type TenantStatus,
} from '../db/control.js';
import {
  exportControlTables,
  importLegacyControl,
  type ControlTables,
} from '../db/legacy-platform.js';
import type { Env } from '../env.js';
import { todayCR } from '../lib/cr-time.js';
import { exportTenant } from '../lib/export.js';
import type { AppEnv } from '../lib/http.js';
import { LEGACY_PLATFORM_OBJECT_NAME, legacyPlatform, tenantStub } from '../lib/platform-client.js';
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
    // El objeto original (Singapur) solo responde a exportLegacyControl: nunca se migra a sí mismo.
    if (!ctx.id.equals(env.PLATFORM.idFromName(LEGACY_PLATFORM_OBJECT_NAME))) {
      // Si la copia lanza, blockConcurrencyWhile reinicia el objeto antes de atender nada.
      ctx.blockConcurrencyWhile(async () => {
        const result = await importLegacyControl(ctx.storage, () =>
          legacyPlatform(env).exportLegacyControl(),
        );
        // Sin esperar: la plataforma atiende ya, y un negocio sin estado guardado está activo.
        if (result === 'imported') void this.pushTenantStatuses();
      });
    }
  }

  private run<T>(fn: () => T): T {
    return runInPlatform(this.ctx.storage, fn);
  }

  // Tras copiar los negocios de la plataforma anterior: sus DO no tienen el estado guardado (un
  // suspendido atendería como activo). Lo que falle lo corrige la reconciliación diaria.
  private async pushTenantStatuses(): Promise<void> {
    const tenants = this.listMaintainedTenants();
    const results = await Promise.allSettled(
      tenants.map(({ slug, status }) => tenantStub(this.env, slug).setStatus(status)),
    );
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.error(
          `No se pudo avisar su estado al negocio "${tenants[i]!.slug}":`,
          (result.reason as Error)?.message ?? String(result.reason),
        );
      }
    });
  }

  override async fetch(request: Request): Promise<Response> {
    return this.run(() => this.app.fetch(request, this.env));
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
  listMaintainedTenants(): { slug: string; status: TenantStatus }[] {
    const maintained: TenantStatus[] = ['active', 'suspended'];
    return this.run(() =>
      listTenants()
        .filter((t) => maintained.includes(t.status))
        .map(({ slug, status }) => ({ slug, status })),
    );
  }

  // Lo pide una sola vez el objeto nuevo de la plataforma (db/legacy-platform.ts). Sin sesiones.
  exportLegacyControl(): ControlTables {
    return this.run(exportControlTables);
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
