import type { DashboardData } from '@dosuxsoft/shared';
import { getDashboardData } from './repository.js';

export function getDashboard(): DashboardData {
  return getDashboardData();
}
