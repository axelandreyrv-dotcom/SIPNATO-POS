import { profileFromTemplate, type SetupInput } from '@sipnato/shared';
import { saveProfile } from '../business/repository.js';
import {
  generateRecoveryCode,
  hashPassword,
  hashRecoveryCode,
  verifyRecoveryCode,
  verifySetupCode,
} from '../../lib/crypto.js';
import { createSession, revokeSession, revokeUserSessions } from '../../lib/session.js';
import { AppError, CredencialesInvalidas, UsuarioBloqueado } from '../../lib/errors.js';
import { currentTenant } from '../../db/client.js';
import { getSetupCodeHash, setSetupCodeHash } from '../../db/control.js';
import { findDueno, insertUserRow, updateUserRow } from '../users/repository.js';
import { verifyCredentials } from '../users/service.js';
import { insertAuditLog, isAdminSetup } from './repository.js';

interface Meta {
  ip: string | null;
  userAgent: string | null;
}

function auditMeta(meta: Meta) {
  return {
    ...(meta.ip !== null ? { ip: meta.ip } : {}),
    ...(meta.userAgent !== null ? { userAgent: meta.userAgent } : {}),
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────
// Crea al dueño del negocio. Solo funciona una vez y con el código de activación.

export async function setupAdmin(
  input: SetupInput,
  meta: Meta,
): Promise<{ recoveryCode: string; sessionToken: string }> {
  if (isAdminSetup()) {
    throw new AppError('SETUP_ALREADY_DONE', 'El sistema ya fue configurado', 409);
  }

  // Sin código vigente (nunca emitido o ya usado) el setup queda cerrado: falla cerrado.
  const { slug } = currentTenant();
  const codeHash = getSetupCodeHash(slug);
  if (!codeHash || !(await verifySetupCode(input.setupCode, codeHash))) {
    throw new AppError('SETUP_CODE_INVALID', 'Código de activación inválido', 403);
  }

  const recoveryCode = generateRecoveryCode();
  const dueno = insertUserRow(
    {
      username: input.username,
      displayName: input.displayName,
      role: 'dueno',
      secretHash: await hashPassword(input.password),
      recoveryCodeHash: await hashRecoveryCode(recoveryCode),
    },
    meta,
  );
  setSetupCodeHash(slug, null);
  saveProfile(profileFromTemplate(input.template), meta);

  const { token } = await createSession(dueno.id, meta.ip, meta.userAgent);
  insertAuditLog({ action: 'ADMIN_SETUP', userId: dueno.id, ...auditMeta(meta) });

  return { recoveryCode, sessionToken: token };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginUser(
  username: string,
  secret: string,
  meta: Meta,
): Promise<{ sessionToken: string }> {
  let userId: number;
  try {
    userId = (await verifyCredentials(username, secret)).id;
  } catch (err) {
    if (err instanceof CredencialesInvalidas || err instanceof UsuarioBloqueado) {
      insertAuditLog({
        action: err instanceof UsuarioBloqueado ? 'LOGIN_LOCKED' : 'LOGIN_FAILED',
        payloadSnapshot: JSON.stringify({ username }),
        ...auditMeta(meta),
      });
    }
    throw err;
  }

  const { token } = await createSession(userId, meta.ip, meta.userAgent);
  insertAuditLog({ action: 'LOGIN_SUCCESS', userId, ...auditMeta(meta) });
  return { sessionToken: token };
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logoutUser(sessionToken: string, meta: Meta): Promise<void> {
  await revokeSession(sessionToken);
  insertAuditLog({ action: 'LOGOUT', ...auditMeta(meta) });
}

// ─── Recover ──────────────────────────────────────────────────────────────────
// Solo el dueño tiene recovery code. Admins y cajeros los restablece un superior.

export async function recoverAdmin(
  recoveryCode: string,
  newPassword: string,
  meta: Meta,
): Promise<{ newRecoveryCode: string; sessionToken: string; username: string }> {
  const dueno = findDueno();

  // Always verify to prevent timing attacks.
  const dummyHash =
    '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const valid = await verifyRecoveryCode(recoveryCode, dueno?.recoveryCodeHash ?? dummyHash);

  if (!dueno || !valid) {
    insertAuditLog({ action: 'RECOVER_FAILED', ...auditMeta(meta) });
    throw new AppError('INVALID_CREDENTIALS', 'Código de recuperación inválido', 401);
  }

  const newRecoveryCode = generateRecoveryCode();
  updateUserRow(
    dueno.id,
    {
      secretHash: await hashPassword(newPassword),
      recoveryCodeHash: await hashRecoveryCode(newRecoveryCode),
    },
    'RECOVER_SUCCESS',
    {},
    meta,
  );

  // Revoke all of the owner's sessions before creating a new one (CLAUDE.md §6.1)
  revokeUserSessions(dueno.id);
  const { token } = await createSession(dueno.id, meta.ip, meta.userAgent);

  // Se devuelve el usuario porque quien recupera acceso pudo haberlo olvidado también.
  return { newRecoveryCode, sessionToken: token, username: dueno.username };
}
