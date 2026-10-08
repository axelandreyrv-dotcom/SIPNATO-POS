import type {
  ChangeOwnSecretInput,
  CreateUserInput,
  UpdateUserInput,
  UserRecord,
} from '@sipnato/shared';
import { apiFetch } from '../../lib/api-client';

export const usersApi = {
  list: () => apiFetch<UserRecord[]>('/api/users'),

  create: (data: CreateUserInput) =>
    apiFetch<UserRecord>('/api/users', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: UpdateUserInput) =>
    apiFetch<UserRecord>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  changeOwnSecret: (data: ChangeOwnSecretInput) =>
    apiFetch<{ ok: boolean }>('/api/users/me/secret', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
