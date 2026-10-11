import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db/client.js';
import { getSetupCodeHash } from '../db/control.js';
import {
  call,
  createSuperadmin,
  inPlatform,
  loginToken,
  platformCall,
  platformLogin,
  platformToken,
  sessionToken,
} from './helpers.js';

const PASSWORD = 'clave-segura-123';
const setupCodes = new Map<string, string>();

const json = async <T = Record<string, unknown>>(res: Response | Promise<Response>) =>
  (await (await res).json()) as T;

function postSetup(slug: string, setupCode: string) {
  return call(slug, 'POST', '/auth/setup', {
    body: {
      setupCode,
      username: 'dueno',
      displayName: 'Dueño',
      password: PASSWORD,
      confirmPassword: PASSWORD,
    },
  });
}

async function setupOwner(slug: string): Promise<string> {
  const res = await postSetup(slug, setupCodes.get(slug)!);
  expect(res.status, await res.clone().text()).toBe(201);
  return sessionToken(res)!;
}

describe('aislamiento entre negocios', () => {
  let tokenA = '';
  let tokenB = '';

  beforeAll(async () => {
    await createSuperadmin('raiz', PASSWORD);
    const adminToken = platformToken(await platformLogin('raiz', PASSWORD))!;
    for (const [slug, name] of [
      ['taller-a', 'Taller A'],
      ['tienda-b', 'Tienda B'],
    ]) {
      const res = await platformCall('POST', '/platform/tenants', {
        token: adminToken,
        body: { slug, name, paidUntil: null },
      });
      expect(res.status).toBe(201);
      setupCodes.set(slug!, (await json<{ setupCode: string }>(res)).setupCode);
    }
    tokenA = await setupOwner('taller-a');
  });

  it('configurar el dueño de A no configura a B', async () => {
    expect(await json(call('tienda-b', 'GET', '/auth/status'))).toEqual({ setup: false });
  });

  it('setup exige el código de activación del propio negocio', async () => {
    expect((await postSetup('tienda-b', '0000-0000-0000-0000')).status).toBe(403);
    // El código de A ya se consumió y además pertenece a otro negocio.
    expect((await postSetup('tienda-b', setupCodes.get('taller-a')!)).status).toBe(403);
    expect(await json(call('tienda-b', 'GET', '/auth/status'))).toEqual({ setup: false });
  });

  it('el código se invalida al usarse', async () => {
    expect(await inPlatform(() => getSetupCodeHash('taller-a'))).toBeNull();
    expect(await inPlatform(() => getSetupCodeHash('tienda-b'))).not.toBeNull();
  });

  it('la sesión de A no sirve en B', async () => {
    expect((await call('tienda-b', 'GET', '/auth/me', { token: tokenA })).status).toBe(401);
  });

  it('los usuarios de A no existen en B', async () => {
    // B aún no tiene usuarios: el mismo usuario/contraseña de A no abre B.
    await expect(loginToken('tienda-b', 'dueno', PASSWORD)).rejects.toThrow(/401/);
    tokenB = await setupOwner('tienda-b');
  });

  it('los datos creados en A no aparecen en B', async () => {
    const created = await call('taller-a', 'POST', '/api/notes', {
      token: tokenA,
      body: { title: 'Nota privada de A', body: 'solo A' },
    });
    expect(created.status).toBe(201);

    const listA = await (await call('taller-a', 'GET', '/api/notes', { token: tokenA })).text();
    const listB = await (await call('tienda-b', 'GET', '/api/notes', { token: tokenB })).text();
    expect(listA).toMatch(/Nota privada de A/);
    expect(listB).not.toMatch(/Nota privada de A/);
  });

  it('acceder a la BD fuera de un negocio lanza (falla cerrado)', () => {
    expect(() => db.select()).toThrow(/db usado fuera de un negocio/);
  });
});
