import type { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { tenantSubscriptionInfo } from '../platform/service.js';

// El negocio consulta su propia suscripción. El slug sale del Host (middleware), nunca del cliente.
export default async function subscriptionRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAuth, requireRole('dueno', 'admin')] }, async (request) => {
    return tenantSubscriptionInfo(request.tenantSlug!);
  });
}
