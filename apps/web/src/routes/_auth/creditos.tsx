import { createRoute } from '@tanstack/react-router';
import { CreditosPage } from '../../features/creditos/CreditosPage';
import { Route as authRoute } from '../_auth';
import { requireModule } from '../../features/auth/useCurrentUser';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/creditos',
  beforeLoad: ({ context }) => requireModule(context, 'creditos'),
  component: CreditosPage,
});
