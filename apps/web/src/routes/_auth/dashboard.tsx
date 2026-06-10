import { createRoute } from '@tanstack/react-router';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/',
  component: DashboardPlaceholder,
});

function DashboardPlaceholder() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface-bg">
      <div className="text-center">
        <p className="text-sm font-medium text-text-muted">Fase 3 — Dashboard</p>
        <p className="mt-1 text-xs text-text-muted opacity-60">Próximamente en este espacio</p>
      </div>
    </div>
  );
}
