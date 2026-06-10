import { createRoute } from '@tanstack/react-router';
import { SettingsPage } from '../../features/settings/SettingsPage';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/settings',
  component: SettingsPage,
});
