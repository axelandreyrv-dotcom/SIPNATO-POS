import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sessions } from '../db/schema.js';
import { generateSessionToken, hashSessionToken } from './crypto.js';

export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;  // 8 hours absolute
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;           // 60 minutes inactivity

export type Session = typeof sessions.$inferSelect;

export async function createSession(
  ip: string | null,
  userAgent: string | null,
): Promise<{ token: string; session: Session }> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS).toISOString();

  const [session] = await db
    .insert(sessions)
    .values({
      id: randomUUID(),
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

export async function verifySession(token: string): Promise<Session | null> {
  const tokenHash = hashSessionToken(token);

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  if (!session) return null;

  const now = new Date();

  // Absolute expiry
  if (new Date(session.expiresAt) < now) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }

  // Inactivity timeout
  if (new Date(session.lastActiveAt).getTime() + INACTIVITY_TIMEOUT_MS < now.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }

  return session;
}

export async function touchSession(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ lastActiveAt: new Date().toISOString() })
    .where(eq(sessions.id, sessionId));
}

export async function revokeSession(token: string): Promise<void> {
  const tokenHash = hashSessionToken(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function revokeAllSessions(): Promise<void> {
  await db.delete(sessions);
}
