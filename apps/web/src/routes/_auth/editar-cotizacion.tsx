import { createRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { EditarCotizacionPage } from '../../features/quotes/EditarCotizacionPage';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/editar-cotizacion',
  validateSearch: z.object({ id: z.number().int().positive() }),
  component: EditarCotizacionPage,
});
