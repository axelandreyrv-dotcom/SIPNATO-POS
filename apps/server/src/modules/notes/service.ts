import { NotaNoEncontrada } from '../../lib/errors.js';
import type { CreateNoteInput, Note, UpdateNoteInput } from '@sipnato/shared';
import {
  createNoteRow,
  findNoteById,
  hardDeleteNoteRow,
  listNotesRows,
  updateNoteRow,
} from './repository.js';

interface Meta {
  ip: string | null;
  userAgent: string | null;
}

export function createNote(input: CreateNoteInput, meta: Meta): Note {
  return createNoteRow(input, meta);
}

export function updateNote(id: number, input: UpdateNoteInput): Note {
  if (!findNoteById(id)) throw new NotaNoEncontrada();
  return updateNoteRow(id, input);
}

export function deleteNote(id: number, meta: Meta): void {
  const note = findNoteById(id);
  if (!note) throw new NotaNoEncontrada();
  hardDeleteNoteRow(id, meta, { title: note.title, body: note.body });
}

export function listNotes(): Note[] {
  return listNotesRows();
}
