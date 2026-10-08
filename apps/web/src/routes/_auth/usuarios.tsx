import { createRoute } from '@tanstack/react-router';
import { UsersPage } from '../../features/users/UsersPage';
import { requirePermission } from '../../features/auth/useCurrentUser';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/usuarios',
  beforeLoad: ({ context }) => requirePermission(context, 'manageUsers'),
  component: UsersPage,
});
