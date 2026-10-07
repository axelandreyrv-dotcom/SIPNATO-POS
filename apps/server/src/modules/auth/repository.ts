import { currentActorId, db } from '../../db/client.js';
import { auditLog } from '../../db/schema.js';
import { hasAnyUser } from '../users/repository.js';

// El negocio está configurado cuando existe su dueño (el primer usuario, creado en /setup).
export function isAdminSetup(): boolean {
  return hasAnyUser();
}

export function insertAuditLog(entry: {
  action: string;
  entityType?: string;
  entityId?: string;
  payloadSnapshot?: string;
  ip?: string;
  userAgent?: string;
  userId?: number | null;
}): void {
  db.insert(auditLog).values({
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    payloadSnapshot: entry.payloadSnapshot ?? null,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
    userId: entry.userId !== undefined ? entry.userId : currentActorId(),
  }).run();
}
