import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { runMigrations } from '../db/migrator.js';
import { MIGRATIONS } from '../db/migrations.js';

let counter = 0;
const newTenant = () => env.TENANT.get(env.TENANT.idFromName(`migraciones-${++counter}`));

const tableNames = (sql: SqlStorage) =>
  sql
    .exec("SELECT name FROM sqlite_master WHERE type = 'table'")
    .toArray()
    .map((r) => String(r['name']));

describe('migraciones del negocio en el Durable Object', () => {
  it('un DO nuevo queda con las 11 migraciones y las tablas del schema', async () => {
    const applied = await runInDurableObject(newTenant(), (_instance, state) => ({
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
    const boot = await runInDurableObject(newTenant(), (_instance, state) => ({
      counters: state.storage.sql.exec('SELECT COUNT(*) AS n FROM counters').one()['n'],
      settings: state.storage.sql.exec('SELECT COUNT(*) AS n FROM settings').one()['n'],
    }));
    expect(boot).toEqual({ counters: 6, settings: 8 });
  });

  it('dos peticiones simultáneas al primer arranque migran una sola vez', async () => {
    const stub = newTenant();
    const count = (_instance: unknown, state: DurableObjectState) =>
      Number(state.storage.sql.exec('SELECT COUNT(*) AS n FROM __migrations').one()['n']);

    const [a, b] = await Promise.all([
      runInDurableObject(stub, count),
      runInDurableObject(stub, count),
    ]);

    expect([a, b]).toEqual([11, 11]);
  });

  it('una migración nueva sobre una BD con datos guarda el bookmark pre-migración', async () => {
    const result = await runInDurableObject(newTenant(), async (_instance, state) => {
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
    const saved = await runInDurableObject(newTenant(), (_instance, state) => [
      ...state.storage.kv.list({ prefix: 'pre-migracion:' }),
    ]);
    expect(saved).toEqual([]);
  });

  it('una migración que falla no deja nada a medias ni queda registrada', async () => {
    const result = await runInDurableObject(newTenant(), async (_instance, state) => {
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
});
