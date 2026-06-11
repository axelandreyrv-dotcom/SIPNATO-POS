import { apiFetch } from '../../lib/api-client';
import type { BoletaSummary, Customer, CustomerList } from '@sipnato/shared';

export const customersApi = {
  list(q = '', page = 1): Promise<CustomerList> {
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set('q', q);
    return apiFetch<CustomerList>(`/api/customers?${params}`);
  },

  get(id: number): Promise<{ customer: Customer; boletas: BoletaSummary[] }> {
    return apiFetch<{ customer: Customer; boletas: BoletaSummary[] }>(`/api/customers/${id}`);
  },

  lookupByPhone(phone: string): Promise<CustomerList> {
    return apiFetch<CustomerList>(`/api/customers?q=${encodeURIComponent(phone)}`);
  },
};
