import { createRoute } from '@tanstack/react-router';
import { InventoryPage } from '../../features/products/InventoryPage';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/inventario',
  component: InventoryPage,
});
