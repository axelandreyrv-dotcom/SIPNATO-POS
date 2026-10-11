import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { recordNotificationSchema, type CustomerNotification } from '@sipnato/shared';
import { currentActorId, db } from '../../db/client.js';
import { customerNotifications, users } from '../../db/schema.js';
import { getExchangeRateInfo } from '../../lib/exchange-rate.js';
import { readJson, type AppEnv } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';

// ── GET /api/exchange-rate ────────────────────────────────────────────────
export const exchangeRateRoutes = new Hono<AppEnv>();
exchangeRateRoutes.get('/', requireAuth, async (c) => c.json(await getExchangeRateInfo()));

// Registro de avisos por WhatsApp. El mensaje lo envía la persona desde su WhatsApp;
// aquí solo queda constancia de que se abrió el aviso, para quién y quién lo hizo.
const notificationsRoutes = new Hono<AppEnv>();

// ── POST /api/notifications ───────────────────────────────────────────────
notificationsRoutes.post('/', requireAuth, async (c) => {
  const body = recordNotificationSchema.safeParse(await readJson(c));
  if (!body.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } }, 400);
  }
  db.insert(customerNotifications)
    .values({
      ...body.data,
      userId: currentActorId(),
      createdAt: new Date().toISOString(),
    })
    .run();
  return c.json({ ok: true }, 201);
});

// ── GET /api/notifications?entityType=&entityId= ──────────────────────────
notificationsRoutes.get('/', requireAuth, (c) => {
  const entityType = c.req.query('entityType');
  const entityId = Number(c.req.query('entityId'));
  if (!entityType || !Number.isInteger(entityId)) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Parámetros inválidos' } }, 400);
  }
  const rows = db
    .select({
      event: customerNotifications.event,
      createdAt: customerNotifications.createdAt,
      username: users.username,
    })
    .from(customerNotifications)
    .leftJoin(users, eq(users.id, customerNotifications.userId))
    .where(
      and(
        eq(customerNotifications.entityType, entityType),
        eq(customerNotifications.entityId, entityId),
      ),
    )
    .orderBy(desc(customerNotifications.id))
    .limit(20)
    .all() as CustomerNotification[];
  return c.json(rows);
});

export default notificationsRoutes;
