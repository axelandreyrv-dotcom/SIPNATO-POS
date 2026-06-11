import { apiFetch } from '../../lib/api-client';
import type {
  BoletaList,
  BoletaWithCustomer,
  CreateBoletaInput,
} from '@sipnato/shared';

export const boletasApi = {
  create(data: CreateBoletaInput): Promise<BoletaWithCustomer> {
    return apiFetch<BoletaWithCustomer>('/api/boletas', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  list(q = '', page = 1): Promise<BoletaList> {
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set('q', q);
    return apiFetch<BoletaList>(`/api/boletas?${params}`);
  },

  get(id: number): Promise<BoletaWithCustomer> {
    return apiFetch<BoletaWithCustomer>(`/api/boletas/${id}`);
  },
};
