import { runInDurableObject } from 'cloudflare:test';
import { TEMPLATE_INFO, type ModuleKey } from '@dosuxsoft/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../db/migrations.js';
import { runMigrations } from '../db/migrator.js';
import { assignBusiness } from '../modules/business/service.js';
import {
  call,
  createTestTenant,
  inTenant,
  loginToken,
  tenantStub,
  type Method,
} from './helpers.js';

const SYSTEM = { ip: null, userAgent: null };

interface Profile {
  template: string;
  ordersLabel: string;
  fields: { key: string; label: string; type?: string }[];
  modules: ModuleKey[];
}

describe('perfil del negocio y órdenes configurables', () => {
  const tokens: Record<string, string> = {};

  const api = (who: string, slug: string, method: Method, url: string, body?: object) =>
    call(slug, method, url, { token: tokens[`${slug}:${who}`], body });
  const json = async <T = Record<string, unknown>>(res: Response | Promise<Response>) =>
    (await (await res).json()) as T;

  // Como lo hace el panel al crear el negocio: el tipo y los módulos llegan asignados.
  async function setupTenant(slug: string, template: 'taller' | 'tienda') {
    await createTestTenant(slug, {
      assignment: { template, modules: [...TEMPLATE_INFO[template].profile.modules] },
      owner: { username: 'dueno', password: 'clave-dueno-1' },
    });
    tokens[`${slug}:dueno`] = await loginToken(slug, 'dueno', 'clave-dueno-1');
  }

  const order = (fields: Record<string, string>, deviceModel = 'Toyota Corolla') => ({
    customerName: 'Ana Solís',
    customerPhone: '88887777',
    deviceModel,
    fields,
    description: 'Revisión de frenos',
  });

  beforeAll(async () => {
    await setupTenant('taller', 'taller');
    await setupTenant('boutique', 'tienda');

    await api('dueno', 'taller', 'POST', '/api/users', {
      username: 'caja',
      displayName: 'Caja',
      role: 'cajero',
      secret: '112233',
    });
    tokens['taller:caja'] = await loginToken('taller', 'caja', '112233');
  });

  it('el negocio arranca con el tipo asignado por la plataforma', async () => {
    const taller = await json<Profile>(api('dueno', 'taller', 'GET', '/api/business'));
    expect(taller.ordersLabel).toBe('Órdenes de trabajo');
    expect(taller.fields.map((f) => f.key)).toEqual(['placa', 'anio', 'kilometraje', 'color']);

    const tienda = await json<Profile>(api('dueno', 'boutique', 'GET', '/api/business'));
    expect(tienda.modules.includes('ordenes'), 'una tienda no lleva órdenes de servicio').toBe(
      false,
    );
    expect(tienda.modules.includes('apartados')).toBe(true);
  });

  it('un módulo desactivado responde 404 en el servidor, no solo se oculta', async () => {
    const res = await api('dueno', 'boutique', 'GET', '/api/boletas');
    expect(res.status).toBe(404);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('MODULO_DESACTIVADO');
  });

  it('valida los campos de la orden contra el perfil', async () => {
    const sinPlaca = await api('caja', 'taller', 'POST', '/api/boletas', order({}));
    expect(sinPlaca.status).toBe(400);
    expect((await json<{ error: { message: string } }>(sinPlaca)).error.message).toMatch(
      /Placa: dato obligatorio/,
    );

    const kmTexto = await api(
      'caja',
      'taller',
      'POST',
      '/api/boletas',
      order({ placa: 'BCD123', kilometraje: 'mucho' }),
    );
    expect(kmTexto.status).toBe(400);

    const ok = await api(
      'caja',
      'taller',
      'POST',
      '/api/boletas',
      order({ placa: 'BCD123', kilometraje: '85000', inventado: 'x' }),
    );
    expect(ok.status).toBe(201);
    expect(
      (await json<{ fields: unknown }>(ok)).fields,
      'claves fuera del perfil se ignoran y los vacíos no se guardan',
    ).toEqual([
      { key: 'placa', label: 'Placa', value: 'BCD123' },
      { key: 'kilometraje', label: 'Kilometraje', value: '85000' },
    ]);
  });

  it('la búsqueda encuentra órdenes por cualquier campo', async () => {
    const list = await json<{ boletas: unknown[] }>(
      api('caja', 'taller', 'GET', '/api/boletas?q=BCD123'),
    );
    expect(list.boletas).toHaveLength(1);
  });

  it('renombrar o quitar un campo no altera órdenes viejas', async () => {
    const profile = await json<Profile & Record<string, unknown>>(
      api('dueno', 'taller', 'GET', '/api/business'),
    );
    profile.fields = profile.fields
      .filter((f) => f.key !== 'kilometraje')
      .map((f) => (f.key === 'placa' ? { ...f, label: 'Matrícula' } : f));
    profile.fields.push({
      key: 'combustible',
      label: 'Combustible',
      type: 'select',
      required: false,
      options: ['Gasolina', 'Diésel'],
    } as Profile['fields'][number]);
    expect((await api('dueno', 'taller', 'PUT', '/api/business', profile)).status).toBe(200);

    const old = (
      await json<{ boletas: { fields: { label: string }[] }[] }>(
        api('caja', 'taller', 'GET', '/api/boletas?q=BCD123'),
      )
    ).boletas[0]!;
    expect(old.fields.map((f) => f.label)).toEqual(['Placa', 'Kilometraje']);

    const nueva = await api(
      'caja',
      'taller',
      'POST',
      '/api/boletas',
      order({ placa: 'XYZ999', combustible: 'Diésel' }),
    );
    expect((await json<{ fields: { label: string }[] }>(nueva)).fields.map((f) => f.label)).toEqual(
      ['Matrícula', 'Combustible'],
    );

    const opcionInvalida = await api(
      'caja',
      'taller',
      'POST',
      '/api/boletas',
      order({ placa: 'XYZ998', combustible: 'Eléctrico' }),
    );
    expect(opcionInvalida.status).toBe(400);
  });

  it('solo el dueño cambia el perfil; un perfil inválido se rechaza', async () => {
    const profile = await json<Profile>(api('caja', 'taller', 'GET', '/api/business'));
    expect((await api('caja', 'taller', 'PUT', '/api/business', profile)).status).toBe(403);

    const repetidos = { ...profile, fields: [profile.fields[0], profile.fields[0]] };
    expect((await api('dueno', 'taller', 'PUT', '/api/business', repetidos)).status).toBe(400);

    const listaCorta = {
      ...profile,
      fields: [{ key: 'x', label: 'X', type: 'select', required: false, options: ['Única'] }],
    };
    expect((await api('dueno', 'taller', 'PUT', '/api/business', listaCorta)).status).toBe(400);
  });

  it('el dueño no cambia el tipo de negocio ni los módulos aunque los envíe', async () => {
    const profile = await json<Profile>(api('dueno', 'taller', 'GET', '/api/business'));
    const res = await api('dueno', 'taller', 'PUT', '/api/business', {
      ...profile,
      template: 'tienda',
      modules: [],
      ordersLabel: 'Trabajos',
    });
    expect(res.status).toBe(200);
    const after = await json<Profile>(res);
    expect(after.ordersLabel, 'los nombres sí los edita').toBe('Trabajos');
    expect(after.template).toBe('taller');
    expect(after.modules).toEqual(profile.modules);
    expect((await api('caja', 'taller', 'GET', '/api/creditos')).status).toBe(200);
  });

  it('la plataforma desactiva y reactiva un módulo', async () => {
    const { modules } = await json<Profile>(api('dueno', 'taller', 'GET', '/api/business'));
    await inTenant('taller', () =>
      assignBusiness(
        { template: 'taller', modules: modules.filter((m) => m !== 'creditos') },
        SYSTEM,
      ),
    );
    expect((await api('caja', 'taller', 'GET', '/api/creditos')).status).toBe(404);
    await inTenant('taller', () =>
      assignBusiness({ template: 'taller', modules: modules }, SYSTEM),
    );
    expect((await api('caja', 'taller', 'GET', '/api/creditos')).status).toBe(200);
  });

  it('cambiar el tipo reemplaza nombres y campos; mismo tipo los conserva', async () => {
    const before = await json<Profile>(api('dueno', 'taller', 'GET', '/api/business'));
    const same = await inTenant('taller', () =>
      assignBusiness({ template: 'taller', modules: before.modules }, SYSTEM),
    );
    expect(same.after.ordersLabel).toBe(before.ordersLabel);

    const changed = await inTenant('taller', () =>
      assignBusiness({ template: 'electronica', modules: ['ordenes'] }, SYSTEM),
    );
    expect(changed.after.ordersLabel).toBe('Órdenes de servicio');
    expect(changed.after.fields.map((f) => f.key)).toEqual([
      'marca',
      'serie',
      'accesorios',
      'clave',
    ]);
    expect(changed.after.modules).toEqual(['ordenes']);
  });
});

describe('migración 0009 con boletas del formato anterior', () => {
  it('pasa IMEI y contraseña a campos y deja el perfil de celulares', async () => {
    const result = await runInDurableObject(
      tenantStub('perfil-migracion'),
      async (_instance, state) => {
        const sql = state.storage.sql;
        // El DO arranca migrado: se vacía para reproducir una BD de antes de la Fase D (hasta la 0008).
        const tables = sql
          .exec(
            `SELECT name FROM sqlite_master WHERE type = 'table'
             AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'`,
          )
          .toArray()
          .map((r) => String(r['name']));
        state.storage.transactionSync(() => {
          sql.exec('PRAGMA defer_foreign_keys = ON');
          for (const t of tables) sql.exec(`DROP TABLE "${t}"`);
        });
        await runMigrations(state.storage, MIGRATIONS.slice(0, 9));

        sql.exec("INSERT INTO customers (name, phone) VALUES ('Luis', '88880000')");
        const ins =
          'INSERT INTO boletas (customer_id, consecutive, device_model, imei, unlock_password, description) VALUES (1, ?, ?, ?, ?, ?)';
        sql.exec(ins, 1, 'iPhone 12', '490154203237518', '1234', 'Pantalla rota');
        sql.exec(ins, 2, 'Moto G', null, null, 'No carga');

        await runMigrations(state.storage, MIGRATIONS);

        return {
          fields: sql
            .exec('SELECT fields FROM boletas ORDER BY consecutive')
            .toArray()
            .map((r) => JSON.parse(String(r['fields'])) as unknown),
          columns: sql
            .exec("SELECT name FROM pragma_table_info('boletas')")
            .toArray()
            .map((r) => String(r['name'])),
          profile: sql.exec('SELECT template, orders_label FROM business_profile').one(),
        };
      },
    );

    expect(result.fields).toEqual([
      [
        { key: 'imei', label: 'IMEI', value: '490154203237518' },
        { key: 'clave', label: 'Contraseña o patrón', value: '1234' },
      ],
      [],
    ]);
    expect(result.columns.includes('imei')).toBe(false);
    expect(result.profile).toEqual({ template: 'celulares', orders_label: 'Boletas' });
  });
});
