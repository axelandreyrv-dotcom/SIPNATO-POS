import { createRoute, redirect } from '@tanstack/react-router';
import { AppLayout } from '@/app/layout/AppLayout';
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
  component: AppLayout,
});
