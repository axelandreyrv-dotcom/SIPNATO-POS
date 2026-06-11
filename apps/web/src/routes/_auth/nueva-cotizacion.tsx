import { createRoute } from '@tanstack/react-router';
import { NuevaCotizacionPage } from '../../features/quotes/NuevaCotizacionPage';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/nueva-cotizacion',
  component: NuevaCotizacionPage,
});
