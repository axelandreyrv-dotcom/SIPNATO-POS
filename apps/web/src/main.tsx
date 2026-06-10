import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import './styles/globals.css';

// Route imports
import { Route as rootRoute } from './routes/__root';
import { Route as authRoute } from './routes/_auth';
import { Route as dashboardRoute } from './routes/_auth/dashboard';
import { Route as loginRoute } from './routes/login';
import { Route as setupRoute } from './routes/setup';
import { Route as recoverRoute } from './routes/recover';

const routeTree = rootRoute.addChildren([
  loginRoute,
  setupRoute,
  recoverRoute,
  authRoute.addChildren([dashboardRoute]),
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

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
