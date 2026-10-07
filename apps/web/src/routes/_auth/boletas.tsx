import { createRoute } from '@tanstack/react-router';
import { BoletasPage } from '../../features/boletas/BoletasPage';
import { Route as authRoute } from '../_auth';
import { requireModule } from '../../features/auth/useCurrentUser';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/boletas',
  beforeLoad: ({ context }) => requireModule(context, 'ordenes'),
  component: BoletasPage,
});
