import { createRoute, redirect } from '@tanstack/react-router';
import type { CurrentUser } from '@sipnato/shared';
import { AppLayout } from '@/app/layout/AppLayout';
import { authApi } from '@/features/auth/api';
import { Route as rootRoute } from './__root';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  id: '_auth',
  // El usuario queda en el contexto del router para todas las rutas protegidas
  // (ver useCurrentUser). Solo decide qué se muestra: el servidor valida cada acción.
  beforeLoad: async (): Promise<{ user: CurrentUser }> => {
    try {
      const { user } = await authApi.getMe();
      return { user };
    } catch {
      // Network error or 401 → not authenticated
      throw redirect({ to: '/login' });
    }
  },
  component: AppLayout,
});
