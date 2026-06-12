import { CotizacionNoEncontrada } from '../../lib/errors.js';
import type { CreateQuoteInput, QuoteList, QuoteWithItems } from '@sipnato/shared';

import {
  createQuoteRow,
  findQuoteById,
  hardDeleteQuoteRow,
  listQuotesRows,
  updateQuoteRow,
} from './repository.js';

interface Meta {
  ip: string | null;
  userAgent: string | null;
}

export function createQuote(input: CreateQuoteInput, meta: Meta): QuoteWithItems {
  return createQuoteRow(input, meta);
}

export function getQuote(id: number): QuoteWithItems {
  const quote = findQuoteById(id);
  if (!quote) throw new CotizacionNoEncontrada();
  return quote;
}

export function updateQuote(id: number, input: CreateQuoteInput, meta: Meta): QuoteWithItems {
  const exists = findQuoteById(id);
  if (!exists) throw new CotizacionNoEncontrada();
  return updateQuoteRow(id, input, meta);
}

export function deleteQuote(id: number, meta: Meta): void {
  const quote = findQuoteById(id);
  if (!quote) throw new CotizacionNoEncontrada();
  hardDeleteQuoteRow(id, meta, {
    consecutive: quote.consecutive,
    total: quote.total,
    items: quote.items.map((i) => ({ description: i.description, amount: i.amount })),
  });
}

export function listQuotes(page: number): QuoteList {
  const limit = 20;
  const { quotes, total } = listQuotesRows(page, limit);
  return {
    quotes,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
