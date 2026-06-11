import { apiFetch } from '../../lib/api-client';
import type {
  CashRegisterCurrent,
  CashRegisterList,
  CashRegisterTotals,
  OpenCashRegisterInput,
} from '@sipnato/shared';

export const cashRegisterApi = {
  getCurrent(): Promise<CashRegisterCurrent | null> {
    return apiFetch<CashRegisterCurrent | null>('/api/cash-registers/current');
  },

  open(data: OpenCashRegisterInput): Promise<CashRegisterCurrent> {
    return apiFetch<CashRegisterCurrent>('/api/cash-registers/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  close(): Promise<CashRegisterTotals> {
    return apiFetch<CashRegisterTotals>('/api/cash-registers/close', {
      method: 'POST',
    });
  },

  list(page = 1): Promise<CashRegisterList> {
    return apiFetch<CashRegisterList>(`/api/cash-registers?page=${page}`);
  },
};
