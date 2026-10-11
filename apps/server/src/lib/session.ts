import { randomUUID } from 'crypto';
import { eq, lt, or } from 'drizzle-orm';
import { db, type Actor } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import { generateSessionToken, hashSessionToken } from './crypto.js';

export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours absolute
export const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes inactivity

export type Session = typeof sessions.$inferSelect;

export async function createSession(
  userId: number,
  ip: string | null,
  userAgent: string | null,
): Promise<{ token: string; session: Session }> {
  const token = generateSessionToken();
  const tokenHash = await hashSessionToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS).toISOString();

  const [session] = await db
    .insert(sessions)
    .values({
      id: randomUUID(),
      userId,
      tokenHash,
      expiresAt,
      lastActiveAt: now.toISOString(),
      ip,
      userAgent,
    })
    .returning();

  if (!session) throw new Error('Error al crear sesión');
  return { token, session };
}

// Devuelve la sesión y su usuario. Un usuario desactivado invalida la sesión al instante,
// aunque su desactivación ya revoque sus sesiones: defensa en profundidad.
export async function verifySession(
  token: string,
): Promise<{ session: Session; user: Actor } | null> {
  const tokenHash = await hashSessionToken(token);

  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;
  const { session, user } = row;
  const now = new Date();

  const expired =
    new Date(session.expiresAt) < now ||
    new Date(session.lastActiveAt).getTime() + INACTIVITY_TIMEOUT_MS < now.getTime();

  if (expired || !user.active) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }

  return {
    session,
    user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
  };
}

// La última actividad se escribe a lo sumo una vez por minuto: cada escritura es durable y retrasa
// la respuesta. A cambio, una sesión puede vencer por inactividad hasta un minuto antes.
export const TOUCH_INTERVAL_MS = 60 * 1000;

export function shouldTouch(lastActiveAt: string, now = Date.now()): boolean {
  return now - new Date(lastActiveAt).getTime() >= TOUCH_INTERVAL_MS;
}

export async function touchSession(session: Pick<Session, 'id' | 'lastActiveAt'>): Promise<void> {
  if (!shouldTouch(session.lastActiveAt)) return;
  await db
    .update(sessions)
    .set({ lastActiveAt: new Date().toISOString() })
    .where(eq(sessions.id, session.id));
}

export async function revokeSession(token: string): Promise<void> {
  const tokenHash = await hashSessionToken(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

// Mantenimiento diario: sesiones que ya no pasarían verifySession (8 h o 60 min sin uso).
export function deleteStaleSessions(): void {
  const now = Date.now();
  db.delete(sessions)
    .where(
      or(
        lt(sessions.expiresAt, new Date(now).toISOString()),
        lt(sessions.lastActiveAt, new Date(now - INACTIVITY_TIMEOUT_MS).toISOString()),
      ),
    )
    .run();
}

// Al cambiar la contraseña/PIN o desactivar a un usuario (CLAUDE.md §6.1).
export function revokeUserSessions(userId: number): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}
