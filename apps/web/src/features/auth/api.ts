import { apiFetch } from '@/lib/api-client';
import type { LoginInput, RecoverInput, SetupInput } from '@sipnato/shared';

export const authApi = {
  getStatus: () =>
    apiFetch<{ setup: boolean }>('/auth/status'),

  getMe: () =>
    apiFetch<{ authenticated: boolean }>('/auth/me'),

  setup: (data: SetupInput) =>
    apiFetch<{ recoveryCode: string; message: string }>('/auth/setup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (data: LoginInput) =>
    apiFetch<{ ok: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logout: () =>
    apiFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  recover: (data: RecoverInput) =>
    apiFetch<{ newRecoveryCode: string; message: string }>('/auth/recover', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
