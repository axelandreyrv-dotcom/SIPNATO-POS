import { createRoute, Outlet, redirect } from '@tanstack/react-router';
import { ApiError } from '@/lib/api-client';
import { authApi } from '@/features/auth/api';
import { Route as rootRoute } from './__root';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  id: '_auth',
  beforeLoad: async () => {
    try {
      await authApi.getMe();
    } catch {
      // Network error or 401 → not authenticated
      throw redirect({ to: '/login' });
    }
  },
  component: () => <Outlet />,
});
