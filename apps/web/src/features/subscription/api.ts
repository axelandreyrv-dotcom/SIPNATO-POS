import type { SubscriptionInfo } from '@sipnato/shared';
import { apiFetch } from '@/lib/api-client';

export const subscriptionApi = {
  get: () => apiFetch<SubscriptionInfo>('/api/subscription'),
};
