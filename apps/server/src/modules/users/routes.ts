import { Hono } from 'hono';
import { changeOwnSecretSchema, createUserSchema, updateUserSchema } from '@sipnato/shared';
import { readJson, requestMeta, type AppEnv } from '../../lib/http.js';
import { rateLimit } from '../../lib/rate-limit.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { changeOwnSecret, createUser, listUsers, updateUser } from './service.js';

const validationError = (message = 'Datos inválidos') => ({
  error: { code: 'VALIDATION_ERROR', message },
});

const usersRoutes = new Hono<AppEnv>();
const managers = [requireAuth, requireRole('dueno', 'admin')] as const;

// ── GET /api/users ────────────────────────────────────────────────────────
usersRoutes.get('/', ...managers, (c) => c.json(listUsers()));

// ── POST /api/users ───────────────────────────────────────────────────────
usersRoutes.post('/', ...managers, async (c) => {
  const body = createUserSchema.safeParse(await readJson(c));
  if (!body.success) return c.json(validationError(body.error.issues[0]?.message), 400);
  const user = await createUser(c.var.user, body.data, requestMeta(c));
  return c.json(user, 201);
});

// ── PATCH /api/users/:id ──────────────────────────────────────────────────
usersRoutes.patch('/:id', ...managers, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json(validationError('ID inválido'), 400);
  const body = updateUserSchema.safeParse(await readJson(c));
  if (!body.success) return c.json(validationError(body.error.issues[0]?.message), 400);
  return c.json(await updateUser(c.var.user, id, body.data, requestMeta(c)));
});

// ── POST /api/users/me/secret ─────────────────────────────────────────────
// Cualquier usuario cambia su propia contraseña/PIN. Cierra todas sus sesiones.
usersRoutes.post(
  '/me/secret',
  rateLimit('cambio-secreto', 5, 15 * 60_000),
  requireAuth,
  async (c) => {
    const body = changeOwnSecretSchema.safeParse(await readJson(c));
    if (!body.success) return c.json(validationError(), 400);
    await changeOwnSecret(c.var.user, body.data.currentSecret, body.data.newSecret, requestMeta(c));
    return c.json({ ok: true });
  },
);

export default usersRoutes;
