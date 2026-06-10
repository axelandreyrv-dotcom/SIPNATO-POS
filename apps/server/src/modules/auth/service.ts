import {
  generateRecoveryCode,
  generateSessionToken,
  hashPassword,
  hashRecoveryCode,
  hashSessionToken,
  verifyPassword,
  verifyRecoveryCode,
} from '../../lib/crypto.js';
import { createSession, revokeAllSessions, revokeSession } from '../../lib/session.js';
import { AppError } from '../../lib/errors.js';
import {
  createAdmin,
  findAdmin,
  insertAuditLog,
  isAdminSetup,
  updateAdminCredentials,
} from './repository.js';

// ─── Setup ────────────────────────────────────────────────────────────────────

export async function setupAdmin(
  password: string,
  ip: string | null,
  userAgent: string | null,
): Promise<{ recoveryCode: string; sessionToken: string }> {
  if (await isAdminSetup()) {
    throw new AppError('SETUP_ALREADY_DONE', 'El sistema ya fue configurado', 409);
  }

  const passwordHash = await hashPassword(password);
  const recoveryCode = generateRecoveryCode();
  const recoveryCodeHash = await hashRecoveryCode(recoveryCode);

  await createAdmin(passwordHash, recoveryCodeHash);

  const { token } = await createSession(ip, userAgent);

  await insertAuditLog({
    action: 'ADMIN_SETUP',
    ...(ip !== null ? { ip } : {}),
    ...(userAgent !== null ? { userAgent } : {}),
  });

  return { recoveryCode, sessionToken: token };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginAdmin(
  password: string,
  ip: string | null,
  userAgent: string | null,
): Promise<{ sessionToken: string }> {
  const adminRow = await findAdmin();

  // Always call verifyPassword to prevent timing attacks (even if no admin).
  const dummyHash =
    '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const hashToVerify = adminRow?.passwordHash ?? dummyHash;
  const valid = await verifyPassword(password, hashToVerify);

  if (!adminRow || !valid) {
    await insertAuditLog({
      action: 'LOGIN_FAILED',
      ...(ip !== null ? { ip } : {}),
      ...(userAgent !== null ? { userAgent } : {}),
    });
    // Generic error — never reveal whether admin exists or password is wrong.
    throw new AppError('INVALID_CREDENTIALS', 'Credenciales inválidas', 401);
  }

  const { token } = await createSession(ip, userAgent);
  await insertAuditLog({
    action: 'LOGIN_SUCCESS',
    ...(ip !== null ? { ip } : {}),
    ...(userAgent !== null ? { userAgent } : {}),
  });

  return { sessionToken: token };
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logoutAdmin(
  sessionToken: string,
  ip: string | null,
  userAgent: string | null,
): Promise<void> {
  await revokeSession(sessionToken);
  await insertAuditLog({
    action: 'LOGOUT',
    ...(ip !== null ? { ip } : {}),
    ...(userAgent !== null ? { userAgent } : {}),
  });
}

// ─── Recover ──────────────────────────────────────────────────────────────────

export async function recoverAdmin(
  recoveryCode: string,
  newPassword: string,
  ip: string | null,
  userAgent: string | null,
): Promise<{ newRecoveryCode: string; sessionToken: string }> {
  const adminRow = await findAdmin();

  // Always verify to prevent timing attacks.
  const dummyHash =
    '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const hashToVerify = adminRow?.recoveryCodeHash ?? dummyHash;
  const valid = await verifyRecoveryCode(recoveryCode, hashToVerify);

  if (!adminRow || !valid) {
    await insertAuditLog({
      action: 'RECOVER_FAILED',
      ...(ip !== null ? { ip } : {}),
      ...(userAgent !== null ? { userAgent } : {}),
    });
    throw new AppError('INVALID_CREDENTIALS', 'Código de recuperación inválido', 401);
  }

  const newPasswordHash = await hashPassword(newPassword);
  const newRecoveryCode = generateRecoveryCode();
  const newRecoveryCodeHash = await hashRecoveryCode(newRecoveryCode);

  // Revoke all sessions before creating new one (CLAUDE.md §6.1)
  await revokeAllSessions();
  await updateAdminCredentials(newPasswordHash, newRecoveryCodeHash);

  const { token } = await createSession(ip, userAgent);

  await insertAuditLog({
    action: 'RECOVER_SUCCESS',
    ...(ip !== null ? { ip } : {}),
    ...(userAgent !== null ? { userAgent } : {}),
  });

  return { newRecoveryCode, sessionToken: token };
}
