import {
  manageableRoles,
  secretSchemaFor,
  type CreateUserInput,
  type SupervisorAuth,
  type UpdateUserInput,
  type UserRecord,
} from '@sipnato/shared';
import type { Actor } from '../../db/client.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../../lib/crypto.js';
import {
  AppError,
  AutorizacionInvalida,
  CredencialesInvalidas,
  PermisoDenegado,
  UsuarioBloqueado,
  UsuarioNoEncontrado,
  UsuarioYaExiste,
} from '../../lib/errors.js';
import { revokeUserSessions } from '../../lib/session.js';
import { insertAuditLog } from '../auth/repository.js';
import {
  findUserById,
  findUserByUsername,
  insertUserRow,
  listUserRows,
  recordFailedAttempt,
  resetFailedAttempts,
  updateUserRow,
  type UserRow,
} from './repository.js';

interface Meta {
  ip: string | null;
  userAgent: string | null;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

function isLocked(user: UserRow, now = Date.now()): boolean {
  return user.lockedUntil !== null && new Date(user.lockedUntil).getTime() > now;
}

export function toActor(user: UserRow): Actor {
  return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
}

function toRecord(user: UserRow): UserRecord {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    locked: isLocked(user),
    createdAt: user.createdAt,
  };
}

// ─── Verificación de credenciales ─────────────────────────────────────────────
// Un único camino para login y autorizaciones de supervisor: ambos cuentan intentos
// fallidos, así el bloqueo protege también contra fuerza bruta por la vía de autorización.

export async function verifyCredentials(username: string, secret: string): Promise<UserRow> {
  const user = findUserByUsername(username);

  if (user && isLocked(user)) throw new UsuarioBloqueado();

  const valid = await verifyPassword(secret, user?.secretHash ?? DUMMY_HASH);

  if (!user || !user.active || !valid) {
    if (user && user.active && !valid) {
      const attempts = user.failedAttempts + 1;
      const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCK_DURATION_MS).toISOString()
        : null;
      recordFailedAttempt(user.id, lockedUntil ? 0 : attempts, lockedUntil);
      if (lockedUntil) throw new UsuarioBloqueado();
    }
    throw new CredencialesInvalidas();
  }

  if (user.failedAttempts > 0 || user.lockedUntil) resetFailedAttempts(user.id);
  return user;
}

// Un admin o dueño confirma en el momento una acción que el usuario actual no puede hacer solo.
// Los intentos fallidos quedan en el audit_log a nombre del usuario que pidió la autorización.
export async function verifySupervisor(auth: SupervisorAuth): Promise<Actor> {
  const fail = (reason: string) => {
    insertAuditLog({
      action: 'SUPERVISOR_AUTH_FAILED',
      payloadSnapshot: JSON.stringify({ supervisorUsername: auth.username, reason }),
    });
  };

  let user: UserRow;
  try {
    user = await verifyCredentials(auth.username, auth.secret);
  } catch (err) {
    fail(err instanceof UsuarioBloqueado ? 'bloqueado' : 'credenciales');
    if (err instanceof UsuarioBloqueado) throw err;
    throw new AutorizacionInvalida();
  }
  if (user.role !== 'dueno' && user.role !== 'admin') {
    fail('sin permiso');
    throw new AutorizacionInvalida();
  }
  return toActor(user);
}

// ─── Gestión ──────────────────────────────────────────────────────────────────

function assertCanManage(actor: Actor, target: UserRow): void {
  if (target.id === actor.id || !manageableRoles(actor.role).includes(target.role)) {
    throw new PermisoDenegado('No puedes modificar a este usuario');
  }
}

function validateSecret(role: UserRow['role'], secret: string): void {
  const result = secretSchemaFor(role).safeParse(secret);
  if (!result.success) throw new AppError('VALIDATION_ERROR', result.error.issues[0]!.message, 400);
}

export function listUsers(): UserRecord[] {
  return listUserRows().map(toRecord);
}

export async function createUser(actor: Actor, input: CreateUserInput, meta: Meta): Promise<UserRecord> {
  if (!manageableRoles(actor.role).includes(input.role)) {
    throw new PermisoDenegado('No puedes crear usuarios con ese rol');
  }
  if (findUserByUsername(input.username)) throw new UsuarioYaExiste();

  const row = insertUserRow(
    {
      username: input.username,
      displayName: input.displayName,
      role: input.role,
      secretHash: await hashPassword(input.secret),
    },
    meta,
  );
  return toRecord(row);
}

export async function updateUser(
  actor: Actor,
  id: number,
  input: UpdateUserInput,
  meta: Meta,
): Promise<UserRecord> {
  const target = findUserById(id);
  if (!target) throw new UsuarioNoEncontrado();
  assertCanManage(actor, target);

  if (input.secret !== undefined) validateSecret(target.role, input.secret);
  const secretHash = input.secret !== undefined ? await hashPassword(input.secret) : undefined;

  updateUserRow(
    id,
    {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(secretHash ? { secretHash } : {}),
    },
    'USER_UPDATED',
    {
      displayName: input.displayName,
      active: input.active,
      secretChanged: secretHash !== undefined,
      unlocked: input.unlock === true,
    },
    meta,
  );
  if (input.unlock) resetFailedAttempts(id);

  // Desactivar o cambiar el secreto cierra sus sesiones abiertas (CLAUDE.md §6.1).
  if (input.active === false || secretHash) revokeUserSessions(id);

  return toRecord(findUserById(id)!);
}

export async function changeOwnSecret(
  actor: Actor,
  currentSecret: string,
  newSecret: string,
  meta: Meta,
): Promise<void> {
  await verifyCredentials(actor.username, currentSecret);
  validateSecret(actor.role, newSecret);

  updateUserRow(
    actor.id,
    { secretHash: await hashPassword(newSecret) },
    'USER_SECRET_CHANGED',
    {},
    meta,
  );
  revokeUserSessions(actor.id);
}
