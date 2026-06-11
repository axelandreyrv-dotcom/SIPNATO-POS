import { createRoute } from '@tanstack/react-router';
import { ExpensesPage } from '../../features/expenses/ExpensesPage';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/gastos',
  component: ExpensesPage,
});
