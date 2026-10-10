import { Hono } from 'hono';
import { createNoteSchema, updateNoteSchema } from '@sipnato/shared';
import { readJson, requestMeta, type AppEnv } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { createNote, deleteNote, listNotes, updateNote } from './service.js';

const invalidData = { error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } };
const invalidId = { error: { code: 'VALIDATION_ERROR', message: 'ID inválido' } };

const notesRoutes = new Hono<AppEnv>();

// ── GET /api/notes ────────────────────────────────────────────────────────
notesRoutes.get('/', requireAuth, (c) => c.json(listNotes()));

// ── POST /api/notes ───────────────────────────────────────────────────────
notesRoutes.post('/', requireAuth, async (c) => {
  const body = createNoteSchema.safeParse(await readJson(c));
  if (!body.success) return c.json(invalidData, 400);
  return c.json(createNote(body.data, requestMeta(c)), 201);
});

// ── PUT /api/notes/:id ────────────────────────────────────────────────────
notesRoutes.put('/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json(invalidId, 400);
  const body = updateNoteSchema.safeParse(await readJson(c));
  if (!body.success) return c.json(invalidData, 400);
  return c.json(updateNote(id, body.data, requestMeta(c)));
});

// ── DELETE /api/notes/:id ─────────────────────────────────────────────────
notesRoutes.delete('/:id', requireAuth, (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json(invalidId, 400);
  deleteNote(id, requestMeta(c));
  return c.json({ ok: true });
});

export default notesRoutes;
