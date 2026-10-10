import type { SubscriptionInfo } from '@sipnato/shared';
import type { Env } from '../env.js';
import { AppError } from './errors.js';

export interface ExchangeRateRecord {
  date: string; // YYYY-MM-DD
  buy: number; // centésimas de colón
  sell: number;
}

// Lo que un negocio le pide a la plataforma (antes, lecturas directas a control.db).
export interface PlatformClient {
  latestExchangeRate(): Promise<ExchangeRateRecord | null>;
  setupCodeHash(slug: string): Promise<string | null>;
  consumeSetupCode(slug: string): Promise<void>;
  subscriptionInfo(slug: string): Promise<SubscriptionInfo>;
}

const notImplemented = () =>
  new AppError('NO_IMPLEMENTADO', 'Esta función aún no está disponible', 501);

// Provisional: sin tipo de cambio del BCCR (rige el de respaldo del negocio) y sin activación
// ni suscripción hasta que exista la comunicación con el Durable Object de la plataforma.
export function platformClient(_env: Env): PlatformClient {
  return {
    latestExchangeRate: async () => null,
    setupCodeHash: async () => {
      throw notImplemented();
    },
    consumeSetupCode: async () => {
      throw notImplemented();
    },
    subscriptionInfo: async () => {
      throw notImplemented();
    },
  };
}
