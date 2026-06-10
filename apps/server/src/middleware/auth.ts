import type { FastifyReply, FastifyRequest } from 'fastify';
import { COOKIE_NAME } from '../lib/constants.js';
import { touchSession, verifySession } from '../lib/session.js';

declare module 'fastify' {
  interface FastifyRequest {
    sessionId: string;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.cookies[COOKIE_NAME];

  if (!token) {
    return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Sesión requerida' } });
  }

  const session = await verifySession(token);

  if (!session) {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.status(401).send({ error: { code: 'SESSION_EXPIRED', message: 'Sesión expirada' } });
  }

  await touchSession(session.id);
  request.sessionId = session.id;
}
