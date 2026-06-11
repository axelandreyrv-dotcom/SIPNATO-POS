import { createRoute } from '@tanstack/react-router';
import { POSPage } from '../../features/pos/POSPage';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/pos',
  component: POSPage,
});
