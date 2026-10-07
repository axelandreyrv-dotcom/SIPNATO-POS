import { getRouteApi, redirect } from '@tanstack/react-router';
import { can, type CurrentUser, type Permission } from '@sipnato/shared';

const authRouteApi = getRouteApi('/_auth');

export function useCurrentUser(): CurrentUser {
  return authRouteApi.useRouteContext().user;
}

export function useCan(permission: Permission): boolean {
  return can(useCurrentUser().role, permission);
}

// Para `beforeLoad` de rutas que un rol no debe abrir (p. ej. /usuarios para un cajero).
export function requirePermission(context: { user: CurrentUser }, permission: Permission): void {
  if (!can(context.user.role, permission)) throw redirect({ to: '/' });
}
