import { env, runInDurableObject, SELF } from 'cloudflare:test';
import { TEMPLATE_INFO, type AssignBusinessInput } from '@sipnato/shared';
import { runInTenant } from '../db/client.js';
import { runInPlatform } from '../db/control.js';
import { COOKIE_NAME, PLATFORM_COOKIE_NAME } from '../lib/constants.js';
import { generateRecoveryCode, hashPassword, hashRecoveryCode } from '../lib/crypto.js';
import { platform } from '../lib/platform-client.js';
import { insertSuperadmin } from '../modules/platform/repository.js';
import { insertUserRow } from '../modules/users/repository.js';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface TestOwner {
  username: string;
  password: string;
  displayName?: string;
}

export const GENERIC_ASSIGNMENT: AssignBusinessInput = {
  template: 'generico',
  modules: [...TEMPLATE_INFO.generico.profile.modules],
};

export const tenantStub = (slug: string) => env.TENANT.get(env.TENANT.idFromName(slug));

export const tenantUrl = (slug: string, path: string) => `https://${slug}.dosuxsoft.com${path}`;

// Corre `fn` dentro del Durable Object del negocio, con su contexto (db, actor nulo = sistema).
export function inTenant<T>(slug: string, fn: () => T | Promise<T>): Promise<T> {
  return runInDurableObject(tenantStub(slug), (instance) =>
    runInTenant({ slug, db: instance.db, actor: null, env }, fn),
  );
}

// Como lo haría la plataforma: inicializa el DO con su tipo de negocio y módulos. El dueño se
// inserta directo, sin código de activación. Devuelve el recovery code del dueño.
export async function createTestTenant(
  slug: string,
  opts: { owner?: TestOwner; assignment?: AssignBusinessInput } = {},
): Promise<{ recoveryCode: string | null }> {
  await tenantStub(slug).initialize(slug, opts.assignment ?? GENERIC_ASSIGNMENT);
  const owner = opts.owner;
  if (!owner) return { recoveryCode: null };

  const recoveryCode = generateRecoveryCode();
  const secretHash = await hashPassword(owner.password);
  const recoveryCodeHash = await hashRecoveryCode(recoveryCode);
  await inTenant(slug, () => {
    insertUserRow(
      {
        username: owner.username,
        displayName: owner.displayName ?? owner.username,
        role: 'dueno',
        secretHash,
        recoveryCodeHash,
      },
      { ip: null, userAgent: null },
    );
  });
  return { recoveryCode };
}

export interface CallOptions {
  token?: string | undefined;
  body?: unknown;
  ip?: string;
  headers?: Record<string, string>;
}

export function call(
  slug: string,
  method: Method,
  path: string,
  opts: CallOptions = {},
): Promise<Response> {
  const headers = new Headers(opts.headers);
  if (opts.token) headers.set('Cookie', `${COOKIE_NAME}=${opts.token}`);
  if (opts.ip) headers.set('CF-Connecting-IP', opts.ip);
  const init: RequestInit = { method, headers };
  if (opts.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(opts.body);
  }
  return SELF.fetch(tenantUrl(slug, path), init);
}

export function sessionCookie(res: Response): string | null {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE_NAME}=`)) ?? null;
}

export function sessionToken(res: Response): string | null {
  const cookie = sessionCookie(res);
  return cookie ? cookie.slice(COOKIE_NAME.length + 1).split(';')[0]! : null;
}

// IP distinta por login: el rate limit por IP (5/15 min) no debe tapar lo que se prueba.
let ipCounter = 0;
export const nextIp = () => `10.${Math.floor(++ipCounter / 250)}.0.${ipCounter % 250}`;

export function login(
  slug: string,
  username: string,
  password: string,
  ip = nextIp(),
): Promise<Response> {
  return call(slug, 'POST', '/auth/login', { body: { username, password }, ip });
}

export async function loginToken(slug: string, username: string, password: string) {
  const res = await login(slug, username, password);
  if (res.status !== 200) throw new Error(`login ${username}: ${res.status} ${await res.text()}`);
  return sessionToken(res)!;
}

// ─── Plataforma ───────────────────────────────────────────────────────────────

export const platformStub = () => platform(env);

export const ADMIN_ORIGIN = 'https://admin.dosuxsoft.com';

// Corre `fn` dentro del Durable Object de la plataforma, con su control.db.
export function inPlatform<T>(fn: () => T | Promise<T>): Promise<T> {
  return runInDurableObject(platformStub(), (_instance, state) => runInPlatform(state.storage, fn));
}

// Los superadministradores no se crean por HTTP: como lo haría la consola.
export async function createSuperadmin(username: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  await inPlatform(() => insertSuperadmin(username, hash));
}

export function platformCall(
  method: Method,
  path: string,
  opts: CallOptions = {},
): Promise<Response> {
  const headers = new Headers(opts.headers);
  if (opts.token) headers.set('Cookie', `${PLATFORM_COOKIE_NAME}=${opts.token}`);
  if (opts.ip) headers.set('CF-Connecting-IP', opts.ip);
  const init: RequestInit = { method, headers };
  if (opts.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(opts.body);
  }
  return SELF.fetch(`${ADMIN_ORIGIN}${path}`, init);
}

export function platformToken(res: Response): string | null {
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith(`${PLATFORM_COOKIE_NAME}=`));
  return cookie ? cookie.slice(PLATFORM_COOKIE_NAME.length + 1).split(';')[0]! : null;
}

export function platformLogin(username: string, password: string, ip = nextIp()) {
  return platformCall('POST', '/platform/auth/login', { body: { username, password }, ip });
}
