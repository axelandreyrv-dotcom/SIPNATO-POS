import { createRoute } from '@tanstack/react-router';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '$',
  component: () => (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="text-center">
        <p className="text-base font-medium text-text-primary">Módulo en construcción</p>
        <p className="mt-1 text-sm text-text-muted">Esta sección estará disponible próximamente.</p>
      </div>
    </div>
  ),
});
