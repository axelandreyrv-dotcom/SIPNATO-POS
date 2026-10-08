import type { FastifyInstance, FastifyRequest } from 'fastify';
import { changeOwnSecretSchema, createUserSchema, updateUserSchema } from '@sipnato/shared';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { changeOwnSecret, createUser, listUsers, updateUser } from './service.js';

function meta(request: FastifyRequest) {
  return { ip: request.ip ?? null, userAgent: request.headers['user-agent'] ?? null };
}

const validationError = (message = 'Datos inválidos') => ({
  error: { code: 'VALIDATION_ERROR', message },
});

export default async function usersRoutes(app: FastifyInstance) {
  const managers = { preHandler: [requireAuth, requireRole('dueno', 'admin')] };

  // ── GET /api/users ────────────────────────────────────────────────────────
  app.get('/', managers, async () => listUsers());

  // ── POST /api/users ───────────────────────────────────────────────────────
  app.post('/', managers, async (request, reply) => {
    const body = createUserSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send(validationError(body.error.issues[0]?.message));
    const user = await createUser(request.user, body.data, meta(request));
    return reply.status(201).send(user);
  });

  // ── PATCH /api/users/:id ──────────────────────────────────────────────────
  app.patch('/:id', managers, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.status(400).send(validationError('ID inválido'));
    const body = updateUserSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send(validationError(body.error.issues[0]?.message));
    return updateUser(request.user, id, body.data, meta(request));
  });

  // ── POST /api/users/me/secret ─────────────────────────────────────────────
  // Cualquier usuario cambia su propia contraseña/PIN. Cierra todas sus sesiones.
  app.post(
    '/me/secret',
    {
      preHandler: [requireAuth],
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      const body = changeOwnSecretSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send(validationError());
      await changeOwnSecret(
        request.user,
        body.data.currentSecret,
        body.data.newSecret,
        meta(request),
      );
      return reply.send({ ok: true });
    },
  );
}
