import type { ExchangeRateInfo } from '@sipnato/shared';
import { apiFetch } from '../../lib/api-client';

export const exchangeRateApi = {
  get: () => apiFetch<ExchangeRateInfo>('/api/exchange-rate'),
};
