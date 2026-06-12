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

  update(id: number, data: CreateQuoteInput): Promise<QuoteWithItems> {
    return apiFetch<QuoteWithItems>(`/api/quotes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete(id: number): Promise<{ ok: boolean }> {
    return apiFetch<{ ok: boolean }>(`/api/quotes/${id}`, {
      method: 'DELETE',
    });
  },
};
