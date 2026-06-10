import { strict as assert } from 'assert';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { isNull } from 'drizzle-orm';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';
import { fileURLToPath } from 'url';
import * as schema from '../schema.js';
import { cashRegisters, counters, expenses, sales } from '../schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(__dirname, '..', 'migrations');

// Each test suite uses an in-memory DB so tests are isolated and fast.
function makeTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return { db, sqlite };
}

describe('counters — consecutivos transaccionales', () => {
  let db: ReturnType<typeof makeTestDb>['db'];
  let sqlite: ReturnType<typeof makeTestDb>['sqlite'];

  before(() => {
    ({ db, sqlite } = makeTestDb());
    sqlite.prepare("INSERT INTO counters (type, current_value) VALUES ('sale', 0)").run();
  });

  after(() => sqlite.close());

  it('incrementa de forma atómica y retorna el nuevo valor', () => {
    const next = sqlite.transaction(() => {
      sqlite
        .prepare("UPDATE counters SET current_value = current_value + 1 WHERE type = 'sale'")
        .run();
      const row = sqlite
        .prepare("SELECT current_value FROM counters WHERE type = 'sale'")
        .get() as { current_value: number };
      return row.current_value;
    })();

    assert.strictEqual(next, 1);
  });

  it('dos transacciones secuenciales no generan huecos', () => {
    const inc = sqlite.transaction(() => {
      sqlite
        .prepare("UPDATE counters SET current_value = current_value + 1 WHERE type = 'sale'")
        .run();
      return (
        sqlite
          .prepare("SELECT current_value FROM counters WHERE type = 'sale'")
          .get() as { current_value: number }
      ).current_value;
    });

    const a = inc();
    const b = inc();

    assert.strictEqual(b, a + 1, 'consecutivos deben ser contiguos');
  });
});

describe('soft-delete — ventas', () => {
  let db: ReturnType<typeof makeTestDb>['db'];
  let sqlite: ReturnType<typeof makeTestDb>['sqlite'];

  before(() => {
    ({ db, sqlite } = makeTestDb());

    // Caja abierta necesaria por FK
    sqlite
      .prepare(
        "INSERT INTO cash_registers (opened_at, opening_amount, created_at) VALUES (datetime('now'), 0, datetime('now'))",
      )
      .run();

    sqlite
      .prepare(
        "INSERT INTO counters (type, current_value) VALUES ('sale', 0)",
      )
      .run();
  });

  after(() => sqlite.close());

  it('venta sin deleted_at aparece en queries normales', async () => {
    await db.insert(sales).values({
      cashRegisterId: 1,
      consecutive: 1,
      amount: 5000,
      paymentMethod: 'efectivo',
    });

    const rows = await db
      .select()
      .from(sales)
      .where(isNull(sales.deletedAt));

    assert.strictEqual(rows.length, 1);
  });

  it('venta con deleted_at NO aparece en queries filtradas por deleted_at IS NULL', async () => {
    await db.insert(sales).values({
      cashRegisterId: 1,
      consecutive: 2,
      amount: 10000,
      paymentMethod: 'tarjeta',
      deletedAt: new Date().toISOString(),
    });

    const activeRows = await db
      .select()
      .from(sales)
      .where(isNull(sales.deletedAt));

    assert.strictEqual(activeRows.length, 1, 'solo la venta sin deleted_at debe aparecer');
  });

  it('la tabla tiene ambas filas en total (soft-delete no borra físicamente)', async () => {
    const allRows = await db.select().from(sales);
    assert.strictEqual(allRows.length, 2);
  });
});

describe('WAL mode y foreign keys', () => {
  it('journal_mode es WAL en base de datos de archivo', () => {
    // WAL mode only applies to file-based DBs, not :memory:
    const tmpPath = join(tmpdir(), `sipnato-test-${Date.now()}.db`);
    const tmpSqlite = new Database(tmpPath);
    tmpSqlite.pragma('journal_mode = WAL');
    const row = tmpSqlite.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    assert.strictEqual(row.journal_mode, 'wal');
    tmpSqlite.close();
    rmSync(tmpPath, { force: true });
    rmSync(`${tmpPath}-wal`, { force: true });
    rmSync(`${tmpPath}-shm`, { force: true });
  });

  it('foreign_keys está activado', () => {
    const { sqlite } = makeTestDb();
    const row = sqlite.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    assert.strictEqual(row.foreign_keys, 1);
    sqlite.close();
  });

  it('insertar con FK inválida falla', () => {
    const { db, sqlite } = makeTestDb();
    assert.rejects(
      async () =>
        await db.insert(sales).values({
          cashRegisterId: 999,
          consecutive: 1,
          amount: 1000,
          paymentMethod: 'efectivo',
        }),
    );
    sqlite.close();
  });
});
