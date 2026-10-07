import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Superadmin } from '@sipnato/shared';
import { PLATFORM_COOKIE_NAME } from '../lib/constants.js';
import { verifyPlatformSession } from '../modules/platform/service.js';

declare module 'fastify' {
  interface FastifyRequest {
    superadmin: Superadmin;
    platformSessionId: string;
  }
}

export async function requirePlatformAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Defensa en profundidad: el middleware de negocios ya rechaza /platform/* fuera del panel.
  if (!request.isPlatform) {
    return reply
      .status(404)
      .send({ error: { code: 'NO_ENCONTRADO', message: 'Recurso no encontrado' } });
  }

  const token = request.cookies[PLATFORM_COOKIE_NAME];
  if (!token) {
    return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Sesión requerida' } });
  }

  const result = verifyPlatformSession(token);
  if (!result) {
    reply.clearCookie(PLATFORM_COOKIE_NAME, { path: '/' });
    return reply
      .status(401)
      .send({ error: { code: 'SESSION_EXPIRED', message: 'Sesión expirada' } });
  }

  request.superadmin = result.admin;
  request.platformSessionId = result.sessionId;
}
