import { eq } from 'drizzle-orm';
import { businessProfileSchema, type BusinessProfile } from '@sipnato/shared';
import { currentActorId, db } from '../../db/client.js';
import { auditLog, businessProfile } from '../../db/schema.js';

interface AuditMeta {
  ip: string | null;
  userAgent: string | null;
}

// La fila existe siempre (la crea la migración 0009). Se valida al leer: un JSON
// corrupto debe fallar ruidosamente, no producir formularios a medias.
export function getProfile(): BusinessProfile {
  const row = db.select().from(businessProfile).where(eq(businessProfile.id, 1)).get();
  if (!row) throw new Error('business_profile vacío: falta la migración 0009');
  return businessProfileSchema.parse({
    template: row.template,
    ordersLabel: row.ordersLabel,
    itemLabel: row.itemLabel,
    fields: JSON.parse(row.fields),
    modules: JSON.parse(row.modules),
  });
}

export function saveProfile(profile: BusinessProfile, meta: AuditMeta): void {
  const values = {
    template: profile.template,
    ordersLabel: profile.ordersLabel,
    itemLabel: profile.itemLabel,
    fields: JSON.stringify(profile.fields),
    modules: JSON.stringify(profile.modules),
    updatedAt: new Date().toISOString(),
  };

  db.transaction((tx) => {
    tx.insert(businessProfile)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: businessProfile.id, set: values })
      .run();

    tx.insert(auditLog).values({
      action: 'BUSINESS_PROFILE_UPDATED',
      entityType: 'business_profile',
      entityId: '1',
      payloadSnapshot: JSON.stringify(profile),
      ip: meta.ip,
      userAgent: meta.userAgent,
      userId: currentActorId(),
    }).run();
  });
}
