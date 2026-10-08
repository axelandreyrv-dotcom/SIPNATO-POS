import type { FastifyInstance } from 'fastify';
import { ownerProfileSchema } from '@sipnato/shared';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { getProfile } from './repository.js';
import { updateOwnerProfile } from './service.js';

export default async function businessRoutes(app: FastifyInstance) {
  // ── GET /api/business ─────────────────────────────────────────────────────
  // Todos los roles: el frontend arma el menú y el formulario de órdenes con esto.
  app.get('/', { preHandler: [requireAuth] }, async () => getProfile());

  // ── PUT /api/business ─────────────────────────────────────────────────────
  // Solo nombres y campos de las órdenes: el tipo de negocio y los módulos los asigna la plataforma.
  app.put('/', { preHandler: [requireAuth, requireRole('dueno')] }, async (request, reply) => {
    const body = ownerProfileSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: body.error.issues[0]?.message ?? 'Datos inválidos',
        },
      });
    }
    return updateOwnerProfile(body.data, {
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });
  });
}
