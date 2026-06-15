import { createRoute } from '@tanstack/react-router';
import { CreditosPage } from '../../features/creditos/CreditosPage';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/creditos',
  component: CreditosPage,
});
