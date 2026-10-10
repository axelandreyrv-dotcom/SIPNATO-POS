import { env, runInDurableObject } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { runInTenant, type TenantDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { ARGON_PARAMS, argonHash, argonVerify, needsRehash } from '../lib/argon.js';
import { DUMMY_HASH } from '../lib/crypto.js';
import { CredencialesInvalidas } from '../lib/errors.js';
import { verifyCredentials } from '../modules/users/service.js';
import nodeArgon2 from './fixtures/node-argon2.txt?raw';

// Hash generado por la librería `argon2` de Node (la del servidor anterior) para esta clave.
const NODE_HASH = nodeArgon2.trim();
const NODE_SECRET = 'clave-compat-123';
const NEW_PREFIX = '$argon2id$v=19$m=19456,t=2,p=1$';

let counter = 0;
const newTenant = () => env.TENANT.get(env.TENANT.idFromName(`argon-${++counter}`));

const readHash = (db: TenantDb) => () =>
  db.select({ h: users.secretHash }).from(users).where(eq(users.username, 'ana')).get()!.h;

// Ejecuta `fn` dentro de un negocio con un usuario `ana` cuyo secreto está hasheado con `hash`.
function withUser<T>(hash: string, fn: (read: () => string) => Promise<T>) {
  return runInDurableObject(newTenant(), (instance) => {
    instance.db
      .insert(users)
      .values({ username: 'ana', displayName: 'Ana', role: 'admin', secretHash: hash })
      .run();
    return runInTenant({ slug: 'argon', db: instance.db, actor: null, env }, () =>
      fn(readHash(instance.db)),
    );
  });
}

describe('argon2id en WebAssembly', () => {
  it('verifica un hash de la librería argon2 de Node (m=65536,t=3,p=4)', async () => {
    expect(await argonVerify(NODE_SECRET, NODE_HASH)).toBe(true);
    expect(await argonVerify('otra-clave', NODE_HASH)).toBe(false);
  });

  it('produce hashes con los parámetros nuevos que se verifican y no se repiten', async () => {
    const a = await argonHash(NODE_SECRET);
    const b = await argonHash(NODE_SECRET);
    expect(a.startsWith(NEW_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
    expect(await argonVerify(NODE_SECRET, a)).toBe(true);
    expect(await argonVerify('otra-clave', a)).toBe(false);
    expect(ARGON_PARAMS).toEqual({ m: 19456, t: 2, p: 1 });
  });

  it('un hash mal formado no verifica ni lanza', async () => {
    expect(await argonVerify('x', 'no-es-un-hash')).toBe(false);
  });

  it('DUMMY_HASH tiene los parámetros nuevos y nunca coincide', async () => {
    expect(DUMMY_HASH.startsWith(NEW_PREFIX)).toBe(true);
    expect(needsRehash(DUMMY_HASH)).toBe(false);
    expect(await argonVerify(NODE_SECRET, DUMMY_HASH)).toBe(false);
  });

  it('needsRehash es true para m=65536 y false para m=19456,t=2,p=1', () => {
    expect(needsRehash(NODE_HASH)).toBe(true);
    expect(needsRehash(`${NEW_PREFIX}c2FsdA$aGFzaA`)).toBe(false);
    expect(needsRehash('basura')).toBe(true);
  });
});

describe('rehash al iniciar sesión', () => {
  it('login con hash viejo lo reemplaza por uno con los parámetros nuevos', async () => {
    const result = await withUser(NODE_HASH, async (read) => {
      const user = await verifyCredentials('ana', NODE_SECRET);
      return { username: user.username, after: read() };
    });
    expect(result.username).toBe('ana');
    expect(result.after.startsWith(NEW_PREFIX)).toBe(true);
    expect(await argonVerify(NODE_SECRET, result.after)).toBe(true);
  });

  it('un hash que ya tiene los parámetros nuevos no se reescribe', async () => {
    const current = await argonHash(NODE_SECRET);
    const after = await withUser(current, async (read) => {
      await verifyCredentials('ana', NODE_SECRET);
      return read();
    });
    expect(after).toBe(current);
  });

  it('contraseña incorrecta no cambia el hash', async () => {
    const result = await withUser(NODE_HASH, async (read) => {
      const error = await verifyCredentials('ana', 'incorrecta').catch((e: unknown) => e);
      return { error, after: read() };
    });
    expect(result.error).toBeInstanceOf(CredencialesInvalidas);
    expect(result.after).toBe(NODE_HASH);
  });
});
