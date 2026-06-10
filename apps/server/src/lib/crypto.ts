import argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

// ─── Passwords ────────────────────────────────────────────────────────────────

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

// ─── Recovery codes ───────────────────────────────────────────────────────────
// High-entropy random string, shown once. Hashed with argon2id at rest
// because the user types it in (brute-force protection needed).

export function generateRecoveryCode(): string {
  return randomBytes(16).toString('hex'); // 32 hex chars
}

export function hashRecoveryCode(code: string): Promise<string> {
  return argon2.hash(code, ARGON2_OPTIONS);
}

export function verifyRecoveryCode(code: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, code);
}

// ─── Session tokens ───────────────────────────────────────────────────────────
// 256-bit random token stored in the cookie. Hashed with SHA-256 for DB lookup.
// SHA-256 is appropriate here — the token is already high-entropy so brute-force
// against the hash is computationally infeasible. argon2id would be too slow
// for per-request verification.

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex'); // 64 hex chars
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
