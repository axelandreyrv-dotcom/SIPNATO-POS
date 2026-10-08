import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { recordNotificationSchema, type CustomerNotification } from '@sipnato/shared';
import { currentActorId, db } from '../../db/client.js';
import { customerNotifications, users } from '../../db/schema.js';
import { getExchangeRateInfo } from '../../lib/exchange-rate.js';
import { requireAuth } from '../../middleware/auth.js';

export async function exchangeRateRoutes(app: FastifyInstance) {
  // ── GET /api/exchange-rate ────────────────────────────────────────────────
  app.get('/', { preHandler: [requireAuth] }, async () => getExchangeRateInfo());
}

// Registro de avisos por WhatsApp. El mensaje lo envía la persona desde su WhatsApp;
// aquí solo queda constancia de que se abrió el aviso, para quién y quién lo hizo.
export default async function notificationsRoutes(app: FastifyInstance) {
  // ── POST /api/notifications ───────────────────────────────────────────────
  app.post('/', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = recordNotificationSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } });
    }
    db.insert(customerNotifications)
      .values({
        ...body.data,
        userId: currentActorId(),
        createdAt: new Date().toISOString(),
      })
      .run();
    return reply.status(201).send({ ok: true });
  });

  // ── GET /api/notifications?entityType=&entityId= ──────────────────────────
  app.get(
    '/',
    { preHandler: [requireAuth] },
    async (request, reply): Promise<CustomerNotification[]> => {
      const q = request.query as { entityType?: string; entityId?: string };
      const entityId = Number(q.entityId);
      if (!q.entityType || !Number.isInteger(entityId)) {
        return reply
          .status(400)
          .send({ error: { code: 'VALIDATION_ERROR', message: 'Parámetros inválidos' } });
      }
      return db
        .select({
          event: customerNotifications.event,
          createdAt: customerNotifications.createdAt,
          username: users.username,
        })
        .from(customerNotifications)
        .leftJoin(users, eq(users.id, customerNotifications.userId))
        .where(
          and(
            eq(customerNotifications.entityType, q.entityType),
            eq(customerNotifications.entityId, entityId),
          ),
        )
        .orderBy(desc(customerNotifications.id))
        .limit(20)
        .all() as CustomerNotification[];
    },
  );
}
