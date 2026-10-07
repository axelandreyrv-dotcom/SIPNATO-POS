import { apiFetch } from '../../lib/api-client';
import type { CreateSaleInput, CreateSaleResult, SaleList, SupervisorAuth } from '@sipnato/shared';

export const salesApi = {
  create(data: CreateSaleInput): Promise<CreateSaleResult> {
    return apiFetch<CreateSaleResult>('/api/sales', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // `authorization`: credenciales de un admin/dueño cuando quien elimina es un cajero.
  delete(id: number, authorization?: SupervisorAuth): Promise<{ ok: boolean }> {
    return apiFetch<{ ok: boolean }>(`/api/sales/${id}`, {
      method: 'DELETE',
      body: JSON.stringify(authorization ? { authorization } : {}),
    });
  },

  list(page = 1): Promise<SaleList> {
    return apiFetch<SaleList>(`/api/sales?page=${page}`);
  },
};
