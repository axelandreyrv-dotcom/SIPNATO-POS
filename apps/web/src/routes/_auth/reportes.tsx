import { createRoute } from '@tanstack/react-router';
import { ReportesPage } from '../../features/reports/ReportesPage';
import { Route as authRoute } from '../_auth';

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/reportes',
  component: ReportesPage,
});
