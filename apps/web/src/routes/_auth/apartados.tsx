import { createRoute } from '@tanstack/react-router';
import { ApartadosPage } from '../../features/apartados/ApartadosPage';
import { Route as authRoute } from '../_auth';
import { requireModule } from '../../features/auth/useCurrentUser';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/apartados',
  beforeLoad: ({ context }) => requireModule(context, 'apartados'),
  component: ApartadosPage,
});
