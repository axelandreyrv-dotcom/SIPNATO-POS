import type { BusinessProfile } from '@sipnato/shared';
import { apiFetch } from '../../lib/api-client';

export const businessApi = {
  get: () => apiFetch<BusinessProfile>('/api/business'),
  update: (data: BusinessProfile) =>
    apiFetch<BusinessProfile>('/api/business', { method: 'PUT', body: JSON.stringify(data) }),
};
