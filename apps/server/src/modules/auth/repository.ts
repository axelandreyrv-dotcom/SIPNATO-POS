import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { admin, auditLog } from '../../db/schema.js';

export type AdminRecord = typeof admin.$inferSelect;

export async function findAdmin(): Promise<AdminRecord | null> {
  const [row] = await db.select().from(admin).limit(1);
  return row ?? null;
}

export async function isAdminSetup(): Promise<boolean> {
  const row = await findAdmin();
  return row !== null;
}

export async function createAdmin(
  passwordHash: string,
  recoveryCodeHash: string,
): Promise<AdminRecord> {
  const [row] = await db
    .insert(admin)
    .values({ passwordHash, recoveryCodeHash })
    .returning();
  if (!row) throw new Error('Error al crear admin');
  return row;
}

export async function updateAdminCredentials(
  passwordHash: string,
  recoveryCodeHash: string,
): Promise<void> {
  await db
    .update(admin)
    .set({
      passwordHash,
      recoveryCodeHash,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(admin.id, 1));
}

export async function insertAuditLog(entry: {
  action: string;
  entityType?: string;
  entityId?: string;
  payloadSnapshot?: string;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  await db.insert(auditLog).values({
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    payloadSnapshot: entry.payloadSnapshot ?? null,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
  });
}
