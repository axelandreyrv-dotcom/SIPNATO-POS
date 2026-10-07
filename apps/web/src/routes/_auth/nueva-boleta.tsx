import { createRoute } from '@tanstack/react-router';
import { NuevoBoletaPage } from '../../features/boletas/NuevoBoletaPage';
import { Route as authRoute } from '../_auth';
import { requireModule } from '../../features/auth/useCurrentUser';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/nueva-boleta',
  beforeLoad: ({ context }) => requireModule(context, 'ordenes'),
  component: NuevoBoletaPage,
});
