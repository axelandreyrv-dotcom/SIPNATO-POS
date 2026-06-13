import type {
  Apartado,
  ApartadoWithPayments,
  ApartadoList,
  CreateApartadoInput,
  AddApartadoPaymentInput,
} from '@sipnato/shared';

const BASE = '/api/apartados';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: { message?: string } }).error?.message ?? 'Error del servidor');
  }
  return res.json() as Promise<T>;
}

export const apartadosApi = {
  list(params?: { status?: string; search?: string }): Promise<ApartadoList> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    const query = qs.toString();
    return request<ApartadoList>(`${BASE}${query ? `?${query}` : ''}`);
  },

  get(id: number): Promise<ApartadoWithPayments> {
    return request<ApartadoWithPayments>(`${BASE}/${id}`);
  },

  create(data: CreateApartadoInput): Promise<Apartado> {
    return request<Apartado>(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  addPayment(id: number, data: AddApartadoPaymentInput): Promise<Apartado> {
    return request<Apartado>(`${BASE}/${id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  cancel(id: number): Promise<Apartado> {
    return request<Apartado>(`${BASE}/${id}/cancel`, { method: 'POST' });
  },
};
