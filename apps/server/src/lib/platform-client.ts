import type { SubscriptionInfo } from '@sipnato/shared';
import type { PlatformDO } from '../do/platform-do.js';
import type { TenantDO } from '../do/tenant-do.js';
import type { Env } from '../env.js';
import { NegocioNoEncontrado } from './errors.js';

export interface ExchangeRateRecord {
  date: string; // YYYY-MM-DD
  buy: number; // centésimas de colón
  sell: number;
}

// Lo que un negocio le pide a la plataforma (antes, lecturas directas a control.db).
export interface PlatformClient {
  latestExchangeRate(): Promise<ExchangeRateRecord | null>;
  // Verifica y gasta el código de activación. false = equivocado, ya usado o nunca emitido.
  consumeSetupCode(slug: string, code: string): Promise<boolean>;
  subscriptionInfo(slug: string): Promise<SubscriptionInfo>;
}

// Este de Norteamérica: lo más cerca de Costa Rica que se puede pedir. Sin la pista, un Durable
// Object nace cerca de quien lo llamó primero (el de la plataforma quedó en Singapur) y ahí se queda.
const LOCATION_HINT: DurableObjectLocationHint = 'enam';

// Un Durable Object no se mueve: para tener la plataforma en `enam` hubo que crear otro objeto con
// otro nombre. El original ('platform') solo se lee una vez, al migrar (db/legacy-platform.ts).
export const PLATFORM_OBJECT_NAME = 'platform-enam';
export const LEGACY_PLATFORM_OBJECT_NAME = 'platform';

// Un solo Durable Object para toda la plataforma.
export function platform(env: Env): DurableObjectStub<PlatformDO> {
  return env.PLATFORM.get(env.PLATFORM.idFromName(PLATFORM_OBJECT_NAME), {
    locationHint: LOCATION_HINT,
  });
}

export function legacyPlatform(env: Env): DurableObjectStub<PlatformDO> {
  return env.PLATFORM.get(env.PLATFORM.idFromName(LEGACY_PLATFORM_OBJECT_NAME));
}

// El Durable Object de un negocio. La pista solo cuenta al crearlo: los que ya existen siguen
// donde nacieron.
export function tenantStub(env: Env, slug: string): DurableObjectStub<TenantDO> {
  return env.TENANT.get(env.TENANT.idFromName(slug), { locationHint: LOCATION_HINT });
}

export function platformClient(env: Env): PlatformClient {
  const stub = platform(env);
  return {
    latestExchangeRate: async () => {
      const row = await stub.latestExchangeRate();
      return row && { date: row.date, buy: row.buy, sell: row.sell };
    },
    consumeSetupCode: (slug, code) => stub.consumeSetupCode(slug, code),
    subscriptionInfo: async (slug) => {
      const info = await stub.subscriptionInfo(slug);
      if (!info) throw new NegocioNoEncontrado();
      return info;
    },
  };
}
