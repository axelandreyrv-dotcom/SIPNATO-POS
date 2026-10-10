import { argonHash, argonVerify } from './argon.js';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const randomHex = (byteCount: number) => toHex(crypto.getRandomValues(new Uint8Array(byteCount)));

// ─── Passwords ────────────────────────────────────────────────────────────────

export function hashPassword(password: string): Promise<string> {
  return argonHash(password);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return argonVerify(password, hash);
}

// Hash argon2id válido que nunca coincide: se verifica contra él cuando el usuario no existe,
// para que la respuesta tarde lo mismo y no revele qué usuarios existen. Debe llevar los
// parámetros vigentes (ARGON_PARAMS) o el tiempo delataría la diferencia.
export const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$gO2LpUKKzWOKwUGqXPYL6Q$O3kGdu0NjthnnEW/Yc2kFmA27aIkBpCnIOII2b/Te4Q';

// ─── Recovery codes ───────────────────────────────────────────────────────────
// High-entropy random string, shown once. Hashed with argon2id at rest
// because the user types it in (brute-force protection needed).

export function generateRecoveryCode(): string {
  return randomHex(16); // 32 hex chars
}

export function hashRecoveryCode(code: string): Promise<string> {
  return argonHash(code);
}

export function verifyRecoveryCode(code: string, hash: string): Promise<boolean> {
  return argonVerify(code, hash);
}

// ─── Setup codes ──────────────────────────────────────────────────────────────
// Código de activación de un negocio nuevo: 64 bits, en grupos de 4 para dictarlo
// o copiarlo sin errores. Se hashea con argon2id porque el usuario lo escribe.

export function generateSetupCode(): string {
  return randomHex(8).toUpperCase().match(/.{4}/g)!.join('-');
}

export function normalizeSetupCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

export function hashSetupCode(code: string): Promise<string> {
  return argonHash(normalizeSetupCode(code));
}

export function verifySetupCode(code: string, hash: string): Promise<boolean> {
  return argonVerify(normalizeSetupCode(code), hash);
}

// ─── Session tokens ───────────────────────────────────────────────────────────
// 256-bit random token stored in the cookie. Hashed with SHA-256 for DB lookup.
// SHA-256 is appropriate here — the token is already high-entropy so brute-force
// against the hash is computationally infeasible. argon2id would be too slow
// for per-request verification.

export function generateSessionToken(): string {
  return randomHex(32); // 64 hex chars
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}
