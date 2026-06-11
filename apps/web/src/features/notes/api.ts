import { apiFetch } from '../../lib/api-client';
import type { CreateNoteInput, Note, UpdateNoteInput } from '@sipnato/shared';

export const notesApi = {
  list(): Promise<Note[]> {
    return apiFetch<Note[]>('/api/notes');
  },

  create(data: CreateNoteInput): Promise<Note> {
    return apiFetch<Note>('/api/notes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(id: number, data: UpdateNoteInput): Promise<Note> {
    return apiFetch<Note>(`/api/notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete(id: number): Promise<{ ok: boolean }> {
    return apiFetch<{ ok: boolean }>(`/api/notes/${id}`, {
      method: 'DELETE',
    });
  },
};
