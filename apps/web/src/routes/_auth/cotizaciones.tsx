import { createRoute } from '@tanstack/react-router';
import { QuotesPage } from '../../features/quotes/QuotesPage';
import { Route as authRoute } from '../_auth';
import { requireModule } from '../../features/auth/useCurrentUser';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/cotizaciones',
  beforeLoad: ({ context }) => requireModule(context, 'cotizaciones'),
  component: QuotesPage,
});
