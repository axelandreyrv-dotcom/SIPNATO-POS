import type { BusinessProfile, OwnerProfileInput } from '@sipnato/shared';
import { apiFetch } from '../../lib/api-client';

export const businessApi = {
  get: () => apiFetch<BusinessProfile>('/api/business'),
  update: (data: OwnerProfileInput) =>
    apiFetch<BusinessProfile>('/api/business', { method: 'PUT', body: JSON.stringify(data) }),
};
