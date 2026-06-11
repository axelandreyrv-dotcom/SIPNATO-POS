import { createRoute } from '@tanstack/react-router';
import { NotesPage } from '../../features/notes/NotesPage';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/notas',
  component: NotesPage,
});
