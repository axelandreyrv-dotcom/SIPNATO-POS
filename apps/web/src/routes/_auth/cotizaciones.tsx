import { createRoute } from '@tanstack/react-router';
import { QuotesPage } from '../../features/quotes/QuotesPage';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/cotizaciones',
  component: QuotesPage,
});
