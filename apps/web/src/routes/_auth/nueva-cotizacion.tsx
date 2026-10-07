import { createRoute } from '@tanstack/react-router';
import { NuevaCotizacionPage } from '../../features/quotes/NuevaCotizacionPage';
import { Route as authRoute } from '../_auth';
import { requireModule } from '../../features/auth/useCurrentUser';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/nueva-cotizacion',
  beforeLoad: ({ context }) => requireModule(context, 'cotizaciones'),
  component: NuevaCotizacionPage,
});
