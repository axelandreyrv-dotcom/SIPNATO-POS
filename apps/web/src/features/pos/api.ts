import { apiFetch } from '../../lib/api-client';
import type { CreateSaleInput, Sale, SaleList } from '@sipnato/shared';

export const salesApi = {
  create(data: CreateSaleInput): Promise<Sale> {
    return apiFetch<Sale>('/api/sales', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  delete(id: number, pin?: string): Promise<{ ok: boolean }> {
    return apiFetch<{ ok: boolean }>(`/api/sales/${id}`, {
      method: 'DELETE',
      ...(pin !== undefined ? { body: JSON.stringify({ pin }) } : {}),
    });
  },

  list(page = 1): Promise<SaleList> {
    return apiFetch<SaleList>(`/api/sales?page=${page}`);
  },
};
