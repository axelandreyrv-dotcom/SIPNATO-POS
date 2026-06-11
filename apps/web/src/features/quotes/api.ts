import { apiFetch } from '../../lib/api-client';
import type { CreateQuoteInput, QuoteList, QuoteWithItems } from '@sipnato/shared';

export const quotesApi = {
  create(data: CreateQuoteInput): Promise<QuoteWithItems> {
    return apiFetch<QuoteWithItems>('/api/quotes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  list(page: number): Promise<QuoteList> {
    return apiFetch<QuoteList>(`/api/quotes?page=${page}`);
  },

  getById(id: number): Promise<QuoteWithItems> {
    return apiFetch<QuoteWithItems>(`/api/quotes/${id}`);
  },

  delete(id: number): Promise<{ ok: boolean }> {
    return apiFetch<{ ok: boolean }>(`/api/quotes/${id}`, {
      method: 'DELETE',
    });
  },
};
