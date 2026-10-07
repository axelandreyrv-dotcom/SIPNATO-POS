import { createRoute } from '@tanstack/react-router';
import { Store } from 'lucide-react';
import { AuthShell } from '@/features/auth/AuthShell';
import { Route as rootRoute } from './__root';

type Motivo = 'no-encontrado' | 'suspendido';

const MENSAJES: Record<Motivo, { titulo: string; detalle: string }> = {
  'no-encontrado': {
    titulo: 'Negocio no encontrado',
    detalle:
      'Esta dirección no corresponde a ningún negocio registrado. Revisa que el enlace esté bien escrito.',
  },
  suspendido: {
    titulo: 'Acceso suspendido',
    detalle:
      'El acceso a este negocio está suspendido temporalmente. Contacta a soporte de Dosuxsoft.',
  },
};

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/no-disponible',
  validateSearch: (search: Record<string, unknown>): { motivo: Motivo } => ({
    motivo: search['motivo'] === 'suspendido' ? 'suspendido' : 'no-encontrado',
  }),
  component: NoDisponiblePage,
});

function NoDisponiblePage() {
  const { motivo } = Route.useSearch();
  const { titulo, detalle } = MENSAJES[motivo];

  return (
    <AuthShell>
      <div className="flex items-start gap-3">
        <Store
          size={22}
          strokeWidth={1.5}
          aria-hidden
          className="mt-0.5 shrink-0 text-text-muted"
        />
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">{titulo}</h1>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">{detalle}</p>
        </div>
      </div>
    </AuthShell>
  );
}
