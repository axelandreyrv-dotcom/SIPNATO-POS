import { Hono } from 'hono';
import type { AppEnv } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { getDashboard } from './service.js';

const dashboardRoutes = new Hono<AppEnv>();

dashboardRoutes.get('/', requireAuth, (c) => c.json(getDashboard()));

export default dashboardRoutes;
