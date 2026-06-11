import { createRoute } from '@tanstack/react-router';
import { BoletasPage } from '../../features/boletas/BoletasPage';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/boletas',
  component: BoletasPage,
});
