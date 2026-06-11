import { CotizacionNoEncontrada } from '../../lib/errors.js';
import type { CreateQuoteInput, QuoteList, QuoteWithItems } from '@sipnato/shared';
import {
  createQuoteRow,
  findQuoteById,
  hardDeleteQuoteRow,
  listQuotesRows,
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

export function deleteQuote(id: number, meta: Meta): void {
  const quote = findQuoteById(id);
  if (!quote) throw new CotizacionNoEncontrada();
  hardDeleteQuoteRow(id, meta, { consecutive: quote.consecutive, total: quote.total });
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
