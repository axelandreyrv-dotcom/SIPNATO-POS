import { strict as assert } from 'assert';
import { after, before, describe, it } from 'node:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

// config.ts lee process.env al importarse: el entorno debe fijarse antes de cargar la app.
const dataDir = mkdtempSync(join(tmpdir(), 'dosuxsoft-business-'));
process.env['DATA_DIR'] = dataDir;
process.env['TENANT_BASE_DOMAIN'] = 'dosuxsoft.test';
process.env['NODE_ENV'] = 'development';

const { buildApp } = await import('../app.js');
const { closeAllTenantDbs } = await import('../db/client.js');
const { closeControlDb, insertTenant, setSetupCodeHash } = await import('../db/control.js');
const { COOKIE_NAME } = await import('../lib/constants.js');
const { generateSetupCode, hashSetupCode } = await import('../lib/crypto.js');

type App = Awaited<ReturnType<typeof buildApp>>;

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(__dirname, '..', 'db', 'migrations');

describe('perfil del negocio y órdenes configurables', () => {
  let app: App;
  const tokens: Record<string, string> = {};
  const host = (slug: string) => `${slug}.dosuxsoft.test`;

  const call = (
    who: string,
    slug: string,
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: object,
  ) =>
    app.inject({
      method,
      url,
      headers: { host: host(slug), cookie: `${COOKIE_NAME}=${tokens[`${slug}:${who}`]}` },
      ...(payload ? { payload } : {}),
    });

  async function setupTenant(slug: string, template: string) {
    insertTenant(slug, slug);
    const code = generateSetupCode();
    setSetupCodeHash(slug, await hashSetupCode(code));
    const res = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      headers: { host: host(slug) },
      payload: {
        setupCode: code,
        template,
        username: 'dueno',
        displayName: 'Dueño',
        password: 'clave-dueno-1',
        confirmPassword: 'clave-dueno-1',
      },
    });
    assert.equal(res.statusCode, 201, res.body);
    tokens[`${slug}:dueno`] = res.cookies.find((c) => c.name === COOKIE_NAME)!.value;
  }

  const order = (fields: Record<string, string>, deviceModel = 'Toyota Corolla') => ({
    customerName: 'Ana Solís',
    customerPhone: '88887777',
    deviceModel,
    fields,
    description: 'Revisión de frenos',
  });

  before(async () => {
    app = await buildApp({ startJobs: false });
    await setupTenant('taller', 'taller');
    await setupTenant('boutique', 'tienda');

    await call('dueno', 'taller', 'POST', '/api/users', {
      username: 'caja',
      displayName: 'Caja',
      role: 'cajero',
      secret: '112233',
    });
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { host: host('taller') },
      payload: { username: 'caja', password: '112233' },
    });
    tokens['taller:caja'] = login.cookies.find((c) => c.name === COOKIE_NAME)!.value;
  });

  after(async () => {
    await app.close();
    closeAllTenantDbs();
    closeControlDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('el setup aplica la plantilla elegida', async () => {
    const taller = (await call('dueno', 'taller', 'GET', '/api/business')).json();
    assert.equal(taller.ordersLabel, 'Órdenes de trabajo');
    assert.deepEqual(
      taller.fields.map((f: { key: string }) => f.key),
      ['placa', 'anio', 'kilometraje', 'color'],
    );

    const tienda = (await call('dueno', 'boutique', 'GET', '/api/business')).json();
    assert.equal(
      tienda.modules.includes('ordenes'),
      false,
      'una tienda no lleva órdenes de servicio',
    );
    assert.equal(tienda.modules.includes('apartados'), true);
  });

  it('un módulo desactivado responde 404 en el servidor, no solo se oculta', async () => {
    const res = await call('dueno', 'boutique', 'GET', '/api/boletas');
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error.code, 'MODULO_DESACTIVADO');
  });

  it('valida los campos de la orden contra el perfil', async () => {
    const sinPlaca = await call('caja', 'taller', 'POST', '/api/boletas', order({}));
    assert.equal(sinPlaca.statusCode, 400);
    assert.match(sinPlaca.json().error.message, /Placa: dato obligatorio/);

    const kmTexto = await call(
      'caja',
      'taller',
      'POST',
      '/api/boletas',
      order({ placa: 'BCD123', kilometraje: 'mucho' }),
    );
    assert.equal(kmTexto.statusCode, 400);

    const ok = await call(
      'caja',
      'taller',
      'POST',
      '/api/boletas',
      order({ placa: 'BCD123', kilometraje: '85000', inventado: 'x' }),
    );
    assert.equal(ok.statusCode, 201, ok.body);
    assert.deepEqual(
      ok.json().fields,
      [
        { key: 'placa', label: 'Placa', value: 'BCD123' },
        { key: 'kilometraje', label: 'Kilometraje', value: '85000' },
      ],
      'claves fuera del perfil se ignoran y los vacíos no se guardan',
    );
  });

  it('la búsqueda encuentra órdenes por cualquier campo', async () => {
    const list = (await call('caja', 'taller', 'GET', '/api/boletas?q=BCD123')).json();
    assert.equal(list.boletas.length, 1);
  });

  it('renombrar o quitar un campo no altera órdenes viejas', async () => {
    const profile = (await call('dueno', 'taller', 'GET', '/api/business')).json();
    profile.fields = profile.fields
      .filter((f: { key: string }) => f.key !== 'kilometraje')
      .map((f: { key: string; label: string }) =>
        f.key === 'placa' ? { ...f, label: 'Matrícula' } : f,
      );
    profile.fields.push({
      key: 'combustible',
      label: 'Combustible',
      type: 'select',
      required: false,
      options: ['Gasolina', 'Diésel'],
    });
    assert.equal((await call('dueno', 'taller', 'PUT', '/api/business', profile)).statusCode, 200);

    const old = (await call('caja', 'taller', 'GET', '/api/boletas?q=BCD123')).json().boletas[0];
    assert.deepEqual(
      old.fields.map((f: { label: string }) => f.label),
      ['Placa', 'Kilometraje'],
    );

    const nueva = await call(
      'caja',
      'taller',
      'POST',
      '/api/boletas',
      order({ placa: 'XYZ999', combustible: 'Diésel' }),
    );
    assert.deepEqual(
      nueva.json().fields.map((f: { label: string }) => f.label),
      ['Matrícula', 'Combustible'],
    );

    const opcionInvalida = await call(
      'caja',
      'taller',
      'POST',
      '/api/boletas',
      order({ placa: 'XYZ998', combustible: 'Eléctrico' }),
    );
    assert.equal(opcionInvalida.statusCode, 400);
  });

  it('solo el dueño cambia el perfil; un perfil inválido se rechaza', async () => {
    const profile = (await call('caja', 'taller', 'GET', '/api/business')).json();
    assert.equal((await call('caja', 'taller', 'PUT', '/api/business', profile)).statusCode, 403);

    const repetidos = { ...profile, fields: [profile.fields[0], profile.fields[0]] };
    assert.equal(
      (await call('dueno', 'taller', 'PUT', '/api/business', repetidos)).statusCode,
      400,
    );

    const listaCorta = {
      ...profile,
      fields: [{ key: 'x', label: 'X', type: 'select', required: false, options: ['Única'] }],
    };
    assert.equal(
      (await call('dueno', 'taller', 'PUT', '/api/business', listaCorta)).statusCode,
      400,
    );
  });

  it('desactivar y reactivar un módulo', async () => {
    const profile = (await call('dueno', 'taller', 'GET', '/api/business')).json();
    await call('dueno', 'taller', 'PUT', '/api/business', {
      ...profile,
      modules: profile.modules.filter((m: string) => m !== 'creditos'),
    });
    assert.equal((await call('caja', 'taller', 'GET', '/api/creditos')).statusCode, 404);
    await call('dueno', 'taller', 'PUT', '/api/business', profile);
    assert.equal((await call('caja', 'taller', 'GET', '/api/creditos')).statusCode, 200);
  });
});

describe('migración 0009 con boletas del formato anterior', () => {
  it('pasa IMEI y contraseña a campos y deja el perfil de celulares', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dosuxsoft-mig-'));
    try {
      // Carpeta de migraciones sin la 0009 para reproducir una BD de antes de la Fase D.
      const before = join(dir, 'migrations-0008');
      cpSync(MIGRATIONS, before, { recursive: true });
      const journalPath = join(before, 'meta', '_journal.json');
      const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
        entries: { idx: number }[];
      };
      // Hasta la 0008 inclusive: Drizzle salta migraciones más viejas que la última aplicada,
      // así que dejar alguna posterior impediría que la 0009 corra después.
      journal.entries = journal.entries.filter((e) => e.idx <= 8);
      writeFileSync(journalPath, JSON.stringify(journal));

      const sqlite = new Database(join(dir, 'legacy.db'));
      sqlite.pragma('foreign_keys = ON');
      const db = drizzle(sqlite);
      migrate(db, { migrationsFolder: before });

      sqlite.prepare("INSERT INTO customers (name, phone) VALUES ('Luis', '88880000')").run();
      const ins = sqlite.prepare(
        'INSERT INTO boletas (customer_id, consecutive, device_model, imei, unlock_password, description) VALUES (1, ?, ?, ?, ?, ?)',
      );
      ins.run(1, 'iPhone 12', '490154203237518', '1234', 'Pantalla rota');
      ins.run(2, 'Moto G', null, null, 'No carga');

      migrate(db, { migrationsFolder: MIGRATIONS });

      const rows = sqlite
        .prepare('SELECT consecutive, fields FROM boletas ORDER BY consecutive')
        .all() as { consecutive: number; fields: string }[];
      assert.deepEqual(JSON.parse(rows[0]!.fields), [
        { key: 'imei', label: 'IMEI', value: '490154203237518' },
        { key: 'clave', label: 'Contraseña o patrón', value: '1234' },
      ]);
      assert.deepEqual(JSON.parse(rows[1]!.fields), []);

      const columns = (
        sqlite.prepare("SELECT name FROM pragma_table_info('boletas')").all() as { name: string }[]
      ).map((c) => c.name);
      assert.equal(columns.includes('imei'), false);

      const profile = sqlite
        .prepare('SELECT template, orders_label FROM business_profile')
        .get() as { template: string; orders_label: string };
      assert.deepEqual(profile, { template: 'celulares', orders_label: 'Boletas' });
      sqlite.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
