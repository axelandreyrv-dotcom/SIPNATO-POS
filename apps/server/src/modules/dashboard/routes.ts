import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.js';
import { getDashboard } from './service.js';

export default async function dashboardRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAuth] }, () => {
    return getDashboard();
  });
}
