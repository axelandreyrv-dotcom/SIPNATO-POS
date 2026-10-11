import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { runMigrations } from '../db/migrator.js';
import { MIGRATIONS } from '../db/migrations.js';
import { GENERIC_ASSIGNMENT, tenantStub } from './helpers.js';

let counter = 0;
const freshStub = () => {
  const slug = `migraciones-${++counter}`;
  return { slug, stub: tenantStub(slug) };
};
// El esquema se crea al inicializar el negocio (lo hace la plataforma), no antes.
const newTenant = async () => {
  const { slug, stub } = freshStub();
  await stub.initialize(slug, GENERIC_ASSIGNMENT);
  return stub;
};

const tableNames = (sql: SqlStorage) =>
  sql
    .exec("SELECT name FROM sqlite_master WHERE type = 'table'")
    .toArray()
    .map((r) => String(r['name']));

describe('migraciones del negocio en el Durable Object', () => {
  it('un DO nuevo queda con las 11 migraciones y las tablas del schema', async () => {
    const applied = await runInDurableObject(await newTenant(), (_instance, state) => ({
      tags: state.storage.sql
        .exec('SELECT tag FROM __migrations ORDER BY tag')
        .toArray()
        .map((r) => String(r['tag'])),
      tables: tableNames(state.storage.sql),
    }));

    expect(applied.tags).toHaveLength(11);
    expect(applied.tags).toEqual(MIGRATIONS.map((m) => m.tag));
    expect(applied.tables).toEqual(
      expect.arrayContaining(['users', 'sales', 'business_profile', 'customer_notifications']),
    );
  });

  it('el arranque deja los contadores y ajustes base del negocio', async () => {
    const boot = await runInDurableObject(await newTenant(), (_instance, state) => ({
      counters: state.storage.sql.exec('SELECT COUNT(*) AS n FROM counters').one()['n'],
      settings: state.storage.sql.exec('SELECT COUNT(*) AS n FROM settings').one()['n'],
    }));
    expect(boot).toEqual({ counters: 6, settings: 8 });
  });

  it('dos inicializaciones simultáneas migran una sola vez', async () => {
    const { slug, stub } = freshStub();
    await Promise.all([
      stub.initialize(slug, GENERIC_ASSIGNMENT),
      stub.initialize(slug, GENERIC_ASSIGNMENT),
    ]);
    const count = await runInDurableObject(stub, (_instance, state) =>
      Number(state.storage.sql.exec('SELECT COUNT(*) AS n FROM __migrations').one()['n']),
    );
    expect(count).toBe(11);
  });

  it('una migración nueva sobre una BD con datos guarda el bookmark pre-migración', async () => {
    const result = await runInDurableObject(await newTenant(), async (_instance, state) => {
      const extra = { tag: '0011_prueba', sql: 'CREATE TABLE prueba (id INTEGER PRIMARY KEY)' };
      const run = await runMigrations(state.storage, [...MIGRATIONS, extra]);
      return {
        run,
        saved: state.storage.kv.get('pre-migracion:0011_prueba'),
        table: tableNames(state.storage.sql).includes('prueba'),
      };
    });

    expect(result.run.applied).toEqual(['0011_prueba']);
    expect(typeof result.run.bookmark).toBe('string');
    expect(result.saved).toBe(result.run.bookmark);
    expect(result.table).toBe(true);
  });

  it('un DO nuevo no guarda bookmark: no hay nada que proteger', async () => {
    const saved = await runInDurableObject(await newTenant(), (_instance, state) => [
      ...state.storage.kv.list({ prefix: 'pre-migracion:' }),
    ]);
    expect(saved).toEqual([]);
  });

  it('una migración que falla no deja nada a medias ni queda registrada', async () => {
    const result = await runInDurableObject(await newTenant(), async (_instance, state) => {
      const broken = {
        tag: '0011_rota',
        sql: 'CREATE TABLE a_medias (id INTEGER);--> statement-breakpoint\nSELECT * FROM no_existe;',
      };
      const error = await runMigrations(state.storage, [...MIGRATIONS, broken]).then(
        () => null,
        (e: Error) => e.message,
      );
      return {
        error,
        half: tableNames(state.storage.sql).includes('a_medias'),
        registered: state.storage.sql
          .exec("SELECT COUNT(*) AS n FROM __migrations WHERE tag = '0011_rota'")
          .one()['n'],
      };
    });
    expect(result.error).toMatch(/no_existe/);
    expect(result.half).toBe(false);
    expect(result.registered).toBe(0);
  });

  it('un negocio ya inicializado migra en el constructor al despertar', async () => {
    const { slug, stub } = freshStub();
    // Solo la marca del negocio, sin tablas: como un DO cuyo esquema quedó atrás.
    await runInDurableObject(stub, (_instance, state) => state.storage.kv.put('slug', slug));
    await evictDurableObject(stub);

    const tables = await runInDurableObject(stub, (_instance, state) =>
      tableNames(state.storage.sql),
    );
    expect(tables).toEqual(expect.arrayContaining(['__migrations', 'users', 'business_profile']));
  });
});
