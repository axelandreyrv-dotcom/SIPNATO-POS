import { createRoute } from '@tanstack/react-router';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '$',
  component: () => (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="text-center">
        <p className="text-4xl font-bold text-text-muted">404</p>
        <p className="mt-2 text-base font-medium text-text-primary">Página no encontrada</p>
        <p className="mt-1 text-sm text-text-muted">La dirección que escribiste no existe.</p>
      </div>
    </div>
  ),
});
