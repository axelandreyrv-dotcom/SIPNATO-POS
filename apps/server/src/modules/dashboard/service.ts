import type { DashboardData } from '@sipnato/shared';
import { getDashboardData } from './repository.js';

export function getDashboard(): DashboardData {
  return getDashboardData();
}
