import { createRoute } from '@tanstack/react-router';
import { MyAccountPage } from '../../features/users/MyAccountPage';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/mi-cuenta',
  component: MyAccountPage,
});
