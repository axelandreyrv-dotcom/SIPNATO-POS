import { createRoute, redirect } from '@tanstack/react-router';
import type { BusinessProfile, CurrentUser } from '@sipnato/shared';
import { AppLayout } from '@/app/layout/AppLayout';
import { authApi } from '@/features/auth/api';
import { businessApi } from '@/features/business/api';
import { Route as rootRoute } from './__root';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  id: '_auth',
  // Usuario y perfil del negocio quedan en el contexto del router para todas las rutas
  // protegidas (useCurrentUser / useBusiness). Solo deciden qué se muestra: el servidor
  // valida cada acción y bloquea los módulos desactivados.
  beforeLoad: async (): Promise<{ user: CurrentUser; business: BusinessProfile }> => {
    let user: CurrentUser;
    try {
      ({ user } = await authApi.getMe());
    } catch {
      // Network error or 401 → not authenticated
      throw redirect({ to: '/login' });
    }
    return { user, business: await businessApi.get() };
  },
  component: AppLayout,
});
