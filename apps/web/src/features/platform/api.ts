import type {
  CreateTenantInput,
  PlatformSettings,
  PlatformSummary,
  PlatformTenant,
  PlatformTenantDetail,
  RecordPaymentInput,
  Superadmin,
  UpdateTenantInput,
} from '@sipnato/shared';
import { apiFetch } from '@/lib/api-client';

const json = (body: unknown) => JSON.stringify(body);

export const platformApi = {
  me: () => apiFetch<{ superadmin: Superadmin }>('/platform/auth/me'),
  login: (body: { username: string; password: string }) =>
    apiFetch<{ ok: true }>('/platform/auth/login', { method: 'POST', body: json(body) }),
  logout: () => apiFetch<{ ok: true }>('/platform/auth/logout', { method: 'POST', body: '{}' }),
  changePassword: (body: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => apiFetch<{ ok: true }>('/platform/auth/password', { method: 'POST', body: json(body) }),

  tenants: () =>
    apiFetch<{ tenants: PlatformTenant[]; summary: PlatformSummary }>('/platform/tenants'),
  tenant: (slug: string) => apiFetch<PlatformTenantDetail>(`/platform/tenants/${slug}`),
  createTenant: (body: CreateTenantInput) =>
    apiFetch<{ tenant: PlatformTenant; setupCode: string }>('/platform/tenants', {
      method: 'POST',
      body: json(body),
    }),
  updateTenant: (slug: string, body: UpdateTenantInput) =>
    apiFetch<{ tenant: PlatformTenant }>(`/platform/tenants/${slug}`, {
      method: 'PATCH',
      body: json(body),
    }),
  setStatus: (slug: string, status: PlatformTenant['status']) =>
    apiFetch<{ tenant: PlatformTenant }>(`/platform/tenants/${slug}/status`, {
      method: 'POST',
      body: json({ status }),
    }),
  setupCode: (slug: string) =>
    apiFetch<{ setupCode: string }>(`/platform/tenants/${slug}/setup-code`, {
      method: 'POST',
      body: '{}',
    }),
  recordPayment: (slug: string, body: RecordPaymentInput) =>
    apiFetch<{ tenant: PlatformTenant }>(`/platform/tenants/${slug}/payments`, {
      method: 'POST',
      body: json(body),
    }),
  voidPayment: (slug: string, id: number) =>
    apiFetch<{ tenant: PlatformTenant; paidUntilReverted: boolean }>(
      `/platform/tenants/${slug}/payments/${id}/void`,
      { method: 'POST', body: '{}' },
    ),

  settings: () => apiFetch<PlatformSettings>('/platform/settings'),
  saveSettings: (body: PlatformSettings) =>
    apiFetch<PlatformSettings>('/platform/settings', { method: 'PUT', body: json(body) }),
};
