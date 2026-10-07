import { asc, desc, eq, sql } from 'drizzle-orm';
import { currentActorId, db, type UserRole } from '../../db/client.js';
import { auditLog, users } from '../../db/schema.js';

export type UserRow = typeof users.$inferSelect;

interface AuditMeta {
  ip: string | null;
  userAgent: string | null;
}

export function findUserByUsername(username: string): UserRow | null {
  return db.select().from(users).where(eq(users.username, username)).get() ?? null;
}

export function findUserById(id: number): UserRow | null {
  return db.select().from(users).where(eq(users.id, id)).get() ?? null;
}

export function findDueno(): UserRow | null {
  return db.select().from(users).where(eq(users.role, 'dueno')).get() ?? null;
}

export function hasAnyUser(): boolean {
  return db.select({ id: users.id }).from(users).limit(1).get() !== undefined;
}

// Jerarquía: dueño, administradores, cajeros; activos antes que desactivados.
export function listUserRows(): UserRow[] {
  return db
    .select()
    .from(users)
    .orderBy(
      sql`CASE ${users.role} WHEN 'dueno' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`,
      desc(users.active),
      asc(users.displayName),
    )
    .all();
}

export function insertUserRow(
  values: {
    username: string;
    displayName: string;
    role: UserRole;
    secretHash: string;
    recoveryCodeHash?: string | null;
  },
  meta: AuditMeta,
): UserRow {
  return db.transaction((tx) => {
    const row = tx.insert(users).values(values).returning().get();
    if (!row) throw new Error('Error al crear usuario');

    tx.insert(auditLog).values({
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: String(row.id),
      payloadSnapshot: JSON.stringify({ username: row.username, role: row.role }),
      ip: meta.ip,
      userAgent: meta.userAgent,
      userId: currentActorId(),
    }).run();

    return row;
  });
}

export function updateUserRow(
  id: number,
  changes: Partial<Pick<UserRow, 'displayName' | 'active' | 'secretHash' | 'recoveryCodeHash'>>,
  action: string,
  snapshot: Record<string, unknown>,
  meta: AuditMeta,
): void {
  db.transaction((tx) => {
    tx.update(users)
      .set({
        ...changes,
        // Cambiar el secreto también desbloquea al usuario.
        ...(changes.secretHash ? { failedAttempts: 0, lockedUntil: null } : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, id))
      .run();

    tx.insert(auditLog).values({
      action,
      entityType: 'user',
      entityId: String(id),
      payloadSnapshot: JSON.stringify(snapshot),
      ip: meta.ip,
      userAgent: meta.userAgent,
      userId: currentActorId(),
    }).run();
  });
}

export function recordFailedAttempt(id: number, failedAttempts: number, lockedUntil: string | null): void {
  db.update(users).set({ failedAttempts, lockedUntil }).where(eq(users.id, id)).run();
}

export function resetFailedAttempts(id: number): void {
  db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, id)).run();
}
