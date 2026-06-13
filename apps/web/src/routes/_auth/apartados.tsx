import { createRoute } from '@tanstack/react-router';
import { ApartadosPage } from '../../features/apartados/ApartadosPage';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/apartados',
  component: ApartadosPage,
});
