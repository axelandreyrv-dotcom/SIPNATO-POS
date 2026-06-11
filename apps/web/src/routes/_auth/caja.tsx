import { createRoute } from '@tanstack/react-router';
import { CajaPage } from '../../features/cash-register/CajaPage';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/caja',
  component: CajaPage,
});
