import type { SubscriptionInfo } from '@sipnato/shared';
import type { PlatformDO } from '../do/platform-do.js';
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

// Un solo Durable Object para toda la plataforma.
export function platform(env: Env): DurableObjectStub<PlatformDO> {
  return env.PLATFORM.get(env.PLATFORM.idFromName('platform'));
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
