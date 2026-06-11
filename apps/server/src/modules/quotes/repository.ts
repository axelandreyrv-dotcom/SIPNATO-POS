import { count, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLog, counters, quoteItems, quotes } from '../../db/schema.js';
import type { CreateQuoteInput, Quote, QuoteItem, QuoteWithItems } from '@sipnato/shared';

interface AuditMeta {
  ip: string | null;
  userAgent: string | null;
}

function mapItem(r: typeof quoteItems.$inferSelect): QuoteItem {
  return {
    id: r.id,
    quoteId: r.quoteId,
    description: r.description,
    amount: r.amount,
    sortOrder: r.sortOrder,
  };
}

function mapQuote(r: typeof quotes.$inferSelect): Quote {
  return {
    id: r.id,
    consecutive: r.consecutive,
    total: r.total,
    createdAt: r.createdAt,
  };
}

export function createQuoteRow(input: CreateQuoteInput, meta: AuditMeta): QuoteWithItems {
  const now = new Date().toISOString();
  const total = input.items.reduce((sum, item) => sum + item.amount, 0);

  return db.transaction((tx): QuoteWithItems => {
    const counter = tx
      .update(counters)
      .set({ currentValue: sql`${counters.currentValue} + 1` })
      .where(eq(counters.type, 'quote'))
      .returning({ newValue: counters.currentValue })
      .get();

    if (!counter) throw new Error('Counter row for quote is missing — run bootstrapDb');
    const consecutive = counter.newValue;

    const quote = tx
      .insert(quotes)
      .values({ consecutive, total, createdAt: now })
      .returning()
      .get();

    if (!quote) throw new Error('Failed to create quote');

    const items: QuoteItem[] = [];
    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i]!;
      const inserted = tx
        .insert(quoteItems)
        .values({
          quoteId: quote.id,
          description: item.description,
          amount: item.amount,
          sortOrder: i,
        })
        .returning()
        .get();
      if (!inserted) throw new Error('Failed to create quote item');
      items.push(mapItem(inserted));
    }

    tx.insert(auditLog).values({
      action: 'QUOTE_CREATED',
      entityType: 'quote',
      entityId: String(quote.id),
      payloadSnapshot: JSON.stringify({ consecutive, total, itemCount: items.length }),
      ip: meta.ip,
      userAgent: meta.userAgent,
    }).run();

    return { ...mapQuote(quote), items };
  });
}

export function findQuoteById(id: number): QuoteWithItems | null {
  const quote = db.select().from(quotes).where(eq(quotes.id, id)).get();
  if (!quote) return null;

  const items = db
    .select()
    .from(quoteItems)
    .where(eq(quoteItems.quoteId, id))
    .orderBy(quoteItems.sortOrder)
    .all();

  return { ...mapQuote(quote), items: items.map(mapItem) };
}

export function listQuotesRows(page: number, limit: number): { quotes: Quote[]; total: number } {
  const offset = (page - 1) * limit;

  const rows = db
    .select()
    .from(quotes)
    .orderBy(desc(quotes.createdAt), desc(quotes.id))
    .limit(limit)
    .offset(offset)
    .all();

  const countRow = db.select({ total: count() }).from(quotes).get();
  const total = countRow?.total ?? 0;

  return { quotes: rows.map(mapQuote), total };
}

export function hardDeleteQuoteRow(
  id: number,
  meta: AuditMeta,
  snapshot: { consecutive: number; total: number; items: { description: string; amount: number }[] },
): void {
  db.transaction((tx) => {
    tx.delete(quoteItems).where(eq(quoteItems.quoteId, id)).run();
    tx.delete(quotes).where(eq(quotes.id, id)).run();
    tx.insert(auditLog).values({
      action: 'QUOTE_DELETED',
      entityType: 'quote',
      entityId: String(id),
      payloadSnapshot: JSON.stringify(snapshot),
      ip: meta.ip,
      userAgent: meta.userAgent,
    }).run();
  });
}
