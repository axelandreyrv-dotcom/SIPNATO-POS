import { createRoute } from '@tanstack/react-router';
import { NuevoBoletaPage } from '../../features/boletas/NuevoBoletaPage';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/nueva-boleta',
  component: NuevoBoletaPage,
});
