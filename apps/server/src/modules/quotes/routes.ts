import { Hono } from 'hono';
import { createQuoteSchema, updateQuoteSchema } from '@sipnato/shared';
import { readJson, requestMeta, type AppEnv } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { createQuote, deleteQuote, getQuote, listQuotes, updateQuote } from './service.js';

const invalidData = { error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } };
const invalidId = { error: { code: 'VALIDATION_ERROR', message: 'ID inválido' } };

const quotesRoutes = new Hono<AppEnv>();

// ── POST /api/quotes ──────────────────────────────────────────────────────
quotesRoutes.post('/', requireAuth, async (c) => {
  const body = createQuoteSchema.safeParse(await readJson(c));
  if (!body.success) return c.json(invalidData, 400);
  return c.json(createQuote(body.data, requestMeta(c)), 201);
});

// ── GET /api/quotes ───────────────────────────────────────────────────────
quotesRoutes.get('/', requireAuth, (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  return c.json(listQuotes(page));
});

// ── GET /api/quotes/:id ───────────────────────────────────────────────────
quotesRoutes.get('/:id', requireAuth, (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json(invalidId, 400);
  return c.json(getQuote(id));
});

// ── PUT /api/quotes/:id ───────────────────────────────────────────────────
quotesRoutes.put('/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json(invalidId, 400);
  const body = updateQuoteSchema.safeParse(await readJson(c));
  if (!body.success) return c.json(invalidData, 400);
  return c.json(updateQuote(id, body.data, requestMeta(c)));
});

// ── DELETE /api/quotes/:id ────────────────────────────────────────────────
quotesRoutes.delete('/:id', requireAuth, (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json(invalidId, 400);
  deleteQuote(id, requestMeta(c));
  return c.json({ ok: true });
});

export default quotesRoutes;
