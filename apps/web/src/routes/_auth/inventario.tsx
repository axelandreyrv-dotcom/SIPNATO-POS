import { createRoute } from '@tanstack/react-router';
import { InventoryPage } from '../../features/products/InventoryPage';
import { Route as authRoute } from '../_auth';
import { requireModule } from '../../features/auth/useCurrentUser';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/inventario',
  beforeLoad: ({ context }) => requireModule(context, 'inventario'),
  component: InventoryPage,
});
