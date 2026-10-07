import { getRouteApi, redirect } from '@tanstack/react-router';
import {
  can,
  type BusinessProfile,
  type CurrentUser,
  type ModuleKey,
  type Permission,
} from '@sipnato/shared';

const authRouteApi = getRouteApi('/_auth');

export function useCurrentUser(): CurrentUser {
  return authRouteApi.useRouteContext().user;
}

export function useCan(permission: Permission): boolean {
  return can(useCurrentUser().role, permission);
}

// Perfil del negocio: etiquetas, campos de las órdenes y módulos activos.
// Tras guardarlo, `router.invalidate()` vuelve a cargarlo.
export function useBusiness(): BusinessProfile {
  return authRouteApi.useRouteContext().business;
}

export function useModuleEnabled(module: ModuleKey): boolean {
  return useBusiness().modules.includes(module);
}

// Para `beforeLoad` de rutas que un rol no debe abrir (p. ej. /usuarios para un cajero).
export function requirePermission(context: { user: CurrentUser }, permission: Permission): void {
  if (!can(context.user.role, permission)) throw redirect({ to: '/' });
}

// Para `beforeLoad` de rutas de un módulo que el negocio puede desactivar.
export function requireModule(context: { business: BusinessProfile }, module: ModuleKey): void {
  if (!context.business.modules.includes(module)) throw redirect({ to: '/' });
}
