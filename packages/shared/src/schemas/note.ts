import { z } from 'zod';

export const createNoteSchema = z.object({
  title: z.string().min(1, 'El título es requerido').max(200),
  body: z.string().max(5000).default(''),
});

export const updateNoteSchema = z.object({
  title: z.string().min(1, 'El título es requerido').max(200),
  body: z.string().max(5000),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export type Note = {
  id: number;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};
