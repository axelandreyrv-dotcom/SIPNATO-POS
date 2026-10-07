import { redirect } from '@tanstack/react-router';
import { ApiError } from '@/lib/api-client';

// El servidor responde estos códigos cuando el subdominio no es un negocio activo.
// En ese caso no tiene sentido mostrar login ni setup.
export function redirectIfTenantUnavailable(err: unknown): void {
  if (!(err instanceof ApiError)) return;
  if (err.code === 'NEGOCIO_NO_ENCONTRADO') {
    throw redirect({ to: '/no-disponible', search: { motivo: 'no-encontrado' } });
  }
  if (err.code === 'NEGOCIO_SUSPENDIDO') {
    throw redirect({ to: '/no-disponible', search: { motivo: 'suspendido' } });
  }
}
