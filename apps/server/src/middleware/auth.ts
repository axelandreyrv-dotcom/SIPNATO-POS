import type { FastifyReply, FastifyRequest } from 'fastify';
import { setActor, type Actor, type UserRole } from '../db/client.js';
import { COOKIE_NAME } from '../lib/constants.js';
import { touchSession, verifySession } from '../lib/session.js';

declare module 'fastify' {
  interface FastifyRequest {
    sessionId: string;
    user: Actor;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[COOKIE_NAME];

  if (!token) {
    return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Sesión requerida' } });
  }

  const result = await verifySession(token);

  if (!result) {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply
      .status(401)
      .send({ error: { code: 'SESSION_EXPIRED', message: 'Sesión expirada' } });
  }

  await touchSession(result.session.id);
  request.sessionId = result.session.id;
  request.user = result.user;
  setActor(result.user);
}

// Usar DESPUÉS de requireAuth: `preHandler: [requireAuth, requireRole('dueno', 'admin')]`.
export function requireRole(...roles: UserRole[]) {
  return async function checkRole(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!roles.includes(request.user.role)) {
      return reply
        .status(403)
        .send({ error: { code: 'FORBIDDEN', message: 'No tienes permiso para esta acción' } });
    }
  };
}
