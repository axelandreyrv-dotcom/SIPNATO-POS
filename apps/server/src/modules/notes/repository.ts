import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLog, notes } from '../../db/schema.js';
import type { CreateNoteInput, Note, UpdateNoteInput } from '@sipnato/shared';

interface AuditMeta {
  ip: string | null;
  userAgent: string | null;
}

function mapNote(r: typeof notes.$inferSelect): Note {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function createNoteRow(input: CreateNoteInput, meta: AuditMeta): Note {
  const now = new Date().toISOString();

  return db.transaction((tx): Note => {
    const row = tx
      .insert(notes)
      .values({ title: input.title, body: input.body, createdAt: now, updatedAt: now })
      .returning()
      .get();

    if (!row) throw new Error('Failed to create note');

    tx.insert(auditLog).values({
      action: 'NOTE_CREATED',
      entityType: 'note',
      entityId: String(row.id),
      payloadSnapshot: JSON.stringify({ title: input.title, bodyLength: input.body.length }),
      ip: meta.ip,
      userAgent: meta.userAgent,
    }).run();

    return mapNote(row);
  });
}

export function findNoteById(id: number): Note | null {
  const row = db.select().from(notes).where(eq(notes.id, id)).get();
  return row ? mapNote(row) : null;
}

export function updateNoteRow(id: number, input: UpdateNoteInput, meta: AuditMeta): Note {
  const now = new Date().toISOString();

  return db.transaction((tx): Note => {
    const row = tx
      .update(notes)
      .set({ title: input.title, body: input.body, updatedAt: now })
      .where(eq(notes.id, id))
      .returning()
      .get();

    if (!row) throw new Error('Failed to update note');

    tx.insert(auditLog).values({
      action: 'NOTE_UPDATED',
      entityType: 'note',
      entityId: String(id),
      payloadSnapshot: JSON.stringify({ title: input.title, bodyLength: input.body.length }),
      ip: meta.ip,
      userAgent: meta.userAgent,
    }).run();

    return mapNote(row);
  });
}

export function hardDeleteNoteRow(
  id: number,
  meta: AuditMeta,
  snapshot: { title: string; body: string },
): void {
  db.transaction((tx) => {
    tx.delete(notes).where(eq(notes.id, id)).run();
    tx.insert(auditLog).values({
      action: 'NOTE_DELETED',
      entityType: 'note',
      entityId: String(id),
      payloadSnapshot: JSON.stringify(snapshot),
      ip: meta.ip,
      userAgent: meta.userAgent,
    }).run();
  });
}

export function listNotesRows(): Note[] {
  return db
    .select()
    .from(notes)
    .orderBy(desc(notes.updatedAt), desc(notes.id))
    .all()
    .map(mapNote);
}
