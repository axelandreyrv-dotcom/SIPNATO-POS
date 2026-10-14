import type { ExchangeRateInfo } from '@dosuxsoft/shared';
import { apiFetch } from '../../lib/api-client';

export const exchangeRateApi = {
  get: () => apiFetch<ExchangeRateInfo>('/api/exchange-rate'),
};
