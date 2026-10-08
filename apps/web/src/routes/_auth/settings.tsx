import { createRoute } from '@tanstack/react-router';
import { SettingsPage } from '../../features/settings/SettingsPage';
import { requirePermission } from '../../features/auth/useCurrentUser';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/settings',
  beforeLoad: ({ context }) => requirePermission(context, 'manageSettings'),
  component: SettingsPage,
});
