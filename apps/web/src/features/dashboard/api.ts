import { apiFetch } from '../../lib/api-client';
import type { DashboardData } from '@sipnato/shared';

export const dashboardApi = {
  get(): Promise<DashboardData> {
    return apiFetch<DashboardData>('/api/dashboard');
  },
};
