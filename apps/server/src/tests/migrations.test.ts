import { strict as assert } from 'assert';
import { after, describe, it } from 'node:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

// config.ts lee process.env al importarse: el entorno debe fijarse antes de cargar la app.
const dataDir = mkdtempSync(join(tmpdir(), 'dosuxsoft-migrations-'));
process.env['DATA_DIR'] = dataDir;
process.env['NODE_ENV'] = 'development';

const { closeAllTenantDbs, openTenantDb } = await import('../db/client.js');
const { closeControlDb, insertTenant } = await import('../db/control.js');

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');

// BD de un negocio migrada solo hasta `maxIdx`, como la de un servidor con una versión anterior.
function legacyTenantDb(slug: string, maxIdx: number): void {
  const folder = join(dataDir, `migrations-${maxIdx}`);
  cpSync(MIGRATIONS, folder, { recursive: true });
  const journalPath = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { idx: number }[] };
  journal.entries = journal.entries.filter((e) => e.idx <= maxIdx);
  writeFileSync(journalPath, JSON.stringify(journal));

  mkdirSync(join(dataDir, 'tenants'), { recursive: true });
  const sqlite = new Database(join(dataDir, 'tenants', `${slug}.db`));
  migrate(drizzle(sqlite), { migrationsFolder: folder });
  sqlite.prepare("INSERT INTO customers (name, phone) VALUES ('Luis', '88880000')").run();
  sqlite.close();
}

const snapshots = (slug: string) =>
  existsSync(join(dataDir, 'backups', slug))
    ? readdirSync(join(dataDir, 'backups', slug)).filter((f) => f.startsWith('pre-migracion-'))
    : [];

describe('copia antes de migrar', () => {
  after(() => {
    closeAllTenantDbs();
    closeControlDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('un negocio con migraciones pendientes deja una copia con sus datos', () => {
    insertTenant('viejo', 'Negocio viejo');
    legacyTenantDb('viejo', 6);

    openTenantDb('viejo');

    const [file] = snapshots('viejo');
    assert.ok(file, 'debe existir backups/viejo/pre-migracion-*.db');
    const copy = new Database(join(dataDir, 'backups', 'viejo', file), { readonly: true });
    assert.equal((copy.prepare('SELECT COUNT(*) AS n FROM customers').get() as { n: number }).n, 1);
    // La copia es la versión anterior: todavía no tiene las tablas de fases posteriores.
    assert.equal(copy.prepare("SELECT name FROM sqlite_master WHERE name = 'users'").get(), undefined);
    copy.close();
  });

  it('un negocio nuevo o ya al día no genera copias', () => {
    insertTenant('nuevo', 'Negocio nuevo');
    openTenantDb('nuevo');
    closeAllTenantDbs();
    openTenantDb('nuevo');
    assert.deepEqual(snapshots('nuevo'), []);
  });
});
