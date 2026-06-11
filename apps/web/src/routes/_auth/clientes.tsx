import { createRoute } from '@tanstack/react-router';
import { CustomersPage } from '../../features/customers/CustomersPage';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/clientes',
  component: CustomersPage,
});
