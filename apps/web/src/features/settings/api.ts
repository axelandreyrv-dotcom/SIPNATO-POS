import type { Settings } from '@sipnato/shared';
import { apiFetch } from '../../lib/api-client';

export const settingsApi = {
  get: () => apiFetch<Settings>('/api/settings'),
  update: (data: Settings) =>
    apiFetch<Settings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  setSalesPin: (pin: string | null) =>
    apiFetch<{ ok: boolean; pinSet: boolean }>('/api/settings/sales-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),
};
