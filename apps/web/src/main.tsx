import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import './styles/globals.css';

// Route imports
import { Route as rootRoute } from './routes/__root';
import { Route as authRoute } from './routes/_auth';
import { Route as boletasRoute } from './routes/_auth/boletas';
import { Route as cotizacionesRoute } from './routes/_auth/cotizaciones';
import { Route as notasRoute } from './routes/_auth/notas';
import { Route as nuevaCotizacionRoute } from './routes/_auth/nueva-cotizacion';
import { Route as editarCotizacionRoute } from './routes/_auth/editar-cotizacion';
import { Route as cajaRoute } from './routes/_auth/caja';
import { Route as clientesRoute } from './routes/_auth/clientes';
import { Route as dashboardRoute } from './routes/_auth/dashboard';
import { Route as gastosRoute } from './routes/_auth/gastos';
import { Route as nuevaBoletaRoute } from './routes/_auth/nueva-boleta';
import { Route as posRoute } from './routes/_auth/pos';
import { Route as reportesRoute } from './routes/_auth/reportes';
import { Route as settingsRoute } from './routes/_auth/settings';
import { Route as apartadosRoute } from './routes/_auth/apartados';
import { Route as facturasRoute } from './routes/_auth/facturas';
import { Route as nuevaFacturaRoute } from './routes/_auth/nueva-factura';
import { Route as creditosRoute } from './routes/_auth/creditos';
import { Route as usuariosRoute } from './routes/_auth/usuarios';
import { Route as inventarioRoute } from './routes/_auth/inventario';
import { Route as miCuentaRoute } from './routes/_auth/mi-cuenta';
import { Route as notFoundRoute } from './routes/_auth/$';
import { Route as loginRoute } from './routes/login';
import { Route as setupRoute } from './routes/setup';
import { Route as recoverRoute } from './routes/recover';
import { Route as noDisponibleRoute } from './routes/no-disponible';

const routeTree = rootRoute.addChildren([
  loginRoute,
  setupRoute,
  recoverRoute,
  noDisponibleRoute,
  authRoute.addChildren([
    boletasRoute,
    cajaRoute,
    cotizacionesRoute,
    notasRoute,
    nuevaCotizacionRoute,
    editarCotizacionRoute,
    clientesRoute,
    dashboardRoute,
    gastosRoute,
    nuevaBoletaRoute,
    posRoute,
    reportesRoute,
    apartadosRoute,
    facturasRoute,
    nuevaFacturaRoute,
    creditosRoute,
    usuariosRoute,
    inventarioRoute,
    miCuentaRoute,
    settingsRoute,
    notFoundRoute,
  ]),
]);

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root no encontrado en el DOM');

// admin.<dominio> es el panel de la plataforma, no un negocio. Se carga aparte para no
// sumar su código a la app que usan los negocios. El servidor hace la separación real.
const isPlatform = window.location.hostname.split('.')[0] === 'admin';
const PlatformApp = lazy(() => import('./features/platform/PlatformApp'));

createRoot(rootEl).render(
  <StrictMode>
    {isPlatform ? (
      <Suspense fallback={null}>
        <PlatformApp />
      </Suspense>
    ) : (
      <RouterProvider router={router} />
    )}
  </StrictMode>,
);
