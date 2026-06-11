import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Note } from '@sipnato/shared';
import { notesApi } from './api';

const CR_TZ = 'America/Costa_Rica';

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: CR_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

// ── Draft card (creating a new note) ─────────────────────────────────────────
function DraftCard({
  onCreate,
  onCancel,
  isCreating,
}: {
  onCreate: (title: string, body: string) => void;
  onCancel: () => void;
  isCreating: boolean;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate(title.trim(), body);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border-2 border-brand-blue/30 bg-surface-card p-4 shadow-sm"
    >
      <input
        ref={titleRef}
        autoFocus
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título de la nota"
        maxLength={200}
        required
        className="h-9 w-full rounded-lg border border-border bg-surface-input px-3 text-sm font-medium text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20 placeholder:text-text-muted placeholder:font-normal"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Escribe tu nota aquí..."
        maxLength={5000}
        rows={4}
        className="w-full resize-none rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20 placeholder:text-text-muted"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">{body.length}/5000</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-bg"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!title.trim() || isCreating}
            className="flex items-center gap-1.5 rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50"
          >
            {isCreating && <Loader2 size={11} className="animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </form>
  );
}

// ── Note card ─────────────────────────────────────────────────────────────────
function NoteCard({
  note,
  onUpdate,
  onDelete,
  isUpdating,
  isDeleting,
}: {
  note: Note;
  onUpdate: (id: number, title: string, body: string) => void;
  onDelete: (id: number) => void;
  isUpdating: boolean;
  isDeleting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onUpdate(note.id, title.trim(), body);
    setEditing(false);
  }

  function handleCancelEdit() {
    setTitle(note.title);
    setBody(note.body);
    setEditing(false);
  }

  if (editing) {
    return (
      <form
        onSubmit={handleSave}
        className="flex flex-col gap-3 rounded-xl border-2 border-brand-blue/30 bg-surface-card p-4"
      >
        <input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
          className="h-9 w-full rounded-lg border border-border bg-surface-input px-3 text-sm font-medium text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          rows={5}
          className="w-full resize-y rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-text-primary outline-none transition-all focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">{body.length}/5000</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="rounded-lg px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-bg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isUpdating}
              className="flex items-center gap-1.5 rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50"
            >
              {isUpdating && <Loader2 size={11} className="animate-spin" />}
              Guardar cambios
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="group flex flex-col gap-2 rounded-xl border border-border bg-surface-card p-4 transition-shadow hover:shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          {note.title}
        </h3>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded p-1.5 text-text-muted transition-colors hover:bg-brand-blue/10 hover:text-brand-blue"
            aria-label="Editar nota"
          >
            <Pencil size={13} />
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { onDelete(note.id); setConfirmDelete(false); }}
                disabled={isDeleting}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-brand-error bg-brand-error/10 hover:bg-brand-error/20 transition-colors disabled:opacity-50"
              >
                {isDeleting ? <Loader2 size={11} className="animate-spin" /> : null}
                Eliminar
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded p-1 text-text-muted hover:text-text-primary"
                aria-label="Cancelar"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded p-1.5 text-text-muted transition-colors hover:bg-brand-error/10 hover:text-brand-error"
              aria-label="Eliminar nota"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Body preview */}
      {note.body ? (
        <p className="line-clamp-4 text-xs leading-relaxed text-text-muted">{note.body}</p>
      ) : (
        <p className="text-xs italic text-text-muted/60">Sin contenido</p>
      )}

      {/* Footer */}
      <p className="mt-1 text-[10px] text-text-muted/50">
        {fmtDate(note.updatedAt)}
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function NotesPage() {
  const queryClient = useQueryClient();
  const [draftOpen, setDraftOpen] = useState(false);

  const { data: notes, isLoading } = useQuery({
    queryKey: ['notes'],
    queryFn: notesApi.list,
    staleTime: 10_000,
  });

  const createMutation = useMutation({
    mutationFn: notesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      setDraftOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, title, body }: { id: number; title: string; body: string }) =>
      notesApi.update(id, { title, body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => notesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Notas</h1>
          <p className="mt-1 text-sm text-text-muted">Recordatorios e información interna.</p>
        </div>
        {!draftOpen && (
          <button
            type="button"
            onClick={() => setDraftOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99]"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Nueva nota</span>
            <span className="sm:hidden">Nueva</span>
          </button>
        )}
      </div>

      {/* Draft form */}
      {draftOpen && (
        <div className="mb-6">
          <DraftCard
            onCreate={(title, body) => createMutation.mutate({ title, body })}
            onCancel={() => setDraftOpen(false)}
            isCreating={createMutation.isPending}
          />
        </div>
      )}

      {/* Notes grid */}
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 size={18} strokeWidth={1.5} className="animate-spin text-text-muted" />
        </div>
      ) : !notes?.length ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border">
          <p className="text-sm text-text-muted">No hay notas todavía.</p>
          {!draftOpen && (
            <button
              type="button"
              onClick={() => setDraftOpen(true)}
              className="text-xs font-medium text-brand-blue hover:underline"
            >
              Crear la primera →
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onUpdate={(id, title, body) => updateMutation.mutate({ id, title, body })}
              onDelete={(id) => deleteMutation.mutate(id)}
              isUpdating={updateMutation.isPending && updateMutation.variables?.id === note.id}
              isDeleting={deleteMutation.isPending && deleteMutation.variables === note.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
