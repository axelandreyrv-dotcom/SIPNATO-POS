import type { CreateCredito, AddCreditoPayment, Credito, CreditoWithPayments, CreditoList } from '@sipnato/shared';

const BASE = '/api/creditos';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: { message?: string } }).error?.message ?? 'Error del servidor');
  }
  return res.json() as Promise<T>;
}

export const creditosApi = {
  list(params?: { status?: string; search?: string }): Promise<CreditoList> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    const query = qs.toString();
    return request<CreditoList>(`${BASE}${query ? `?${query}` : ''}`);
  },

  get(id: number): Promise<CreditoWithPayments> {
    return request<CreditoWithPayments>(`${BASE}/${id}`);
  },

  create(data: CreateCredito): Promise<Credito> {
    return request<Credito>(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  addPayment(id: number, data: AddCreditoPayment): Promise<{ credito: Credito }> {
    return request<{ credito: Credito }>(`${BASE}/${id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  cancel(id: number): Promise<void> {
    return request<void>(`${BASE}/${id}/cancel`, { method: 'POST' });
  },
};
