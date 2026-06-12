import { z } from 'zod';

export const createQuoteItemSchema = z.object({
  description: z.string().min(1, 'La descripción del ítem es requerida').max(500),
  amount: z.number().int().min(0, 'El monto debe ser mayor o igual a 0'),
});

export const createQuoteSchema = z.object({
  items: z.array(createQuoteItemSchema).min(1, 'La cotización debe tener al menos un ítem'),
});

export type CreateQuoteItemInput = z.infer<typeof createQuoteItemSchema>;
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export type QuoteItem = {
  id: number;
  quoteId: number;
  description: string;
  amount: number;
  sortOrder: number;
};

export type Quote = {
  id: number;
  consecutive: number;
  total: number;
  createdAt: string;
};

export type QuoteWithItems = Quote & {
  items: QuoteItem[];
};

export type QuoteList = {
  quotes: Quote[];
  total: number;
  page: number;
  totalPages: number;
};

export const updateQuoteSchema = createQuoteSchema;
export type UpdateQuoteInput = CreateQuoteInput;
