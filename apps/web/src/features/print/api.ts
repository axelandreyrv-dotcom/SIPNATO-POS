import type { PrintBridgeStatus, PrintPayload } from '@sipnato/shared';
import { apiFetch } from '../../lib/api-client';

export const printApi = {
  getStatus: () => apiFetch<PrintBridgeStatus>('/ws/print/status'),

  createJob: (payload: PrintPayload) =>
    apiFetch<{ id: number; dispatched: boolean }>('/ws/print/jobs', {
      method: 'POST',
      body: JSON.stringify({ payload }),
    }),

  testPrint: () =>
    apiFetch<{ id: number; dispatched: boolean }>('/ws/print/test', {
      method: 'POST',
    }),

  generateToken: () =>
    apiFetch<{ token: string }>('/api/settings/generate-print-token', {
      method: 'POST',
    }),
};
