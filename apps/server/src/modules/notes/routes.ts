import type { FastifyInstance } from 'fastify';
import { createNoteSchema, updateNoteSchema } from '@sipnato/shared';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { createNote, deleteNote, listNotes, updateNote } from './service.js';

export default async function notesRoutes(app: FastifyInstance) {
  // ── GET /api/notes ────────────────────────────────────────────────────────
  app.get('/', { preHandler: [requireAuth] }, async () => {
    return listNotes();
  });

  // ── POST /api/notes ───────────────────────────────────────────────────────
  app.post('/', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = createNoteSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } });
    }

    try {
      const note = createNote(body.data, {
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
      return reply.status(201).send(note);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }
  });

  // ── PUT /api/notes/:id ────────────────────────────────────────────────────
  app.put('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'ID inválido' } });
    }

    const body = updateNoteSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } });
    }

    try {
      return updateNote(parsed, body.data, {
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }
  });

  // ── DELETE /api/notes/:id ─────────────────────────────────────────────────
  app.delete('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'ID inválido' } });
    }

    try {
      deleteNote(parsed, {
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
      return reply.send({ ok: true });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }
  });
}
