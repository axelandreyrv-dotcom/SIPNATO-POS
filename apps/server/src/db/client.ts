import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import * as schema from './schema.js';
import { counters, settings } from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

mkdirSync(dirname(config.DATABASE_PATH), { recursive: true });

const sqlite = new Database(config.DATABASE_PATH);

sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });

export function runMigrations(): void {
  migrate(db, { migrationsFolder: join(__dirname, 'migrations') });
}

// Inserta datos estructurales mínimos que deben existir en cualquier entorno.
// Idempotente — onConflictDoNothing garantiza que no rompe si ya existen.
export async function bootstrapDb(): Promise<void> {
  await db.insert(counters).values([
    { type: 'sale', currentValue: 0 },
    { type: 'boleta', currentValue: 0 },
    { type: 'quote', currentValue: 0 },
    { type: 'apartado', currentValue: 0 },
    { type: 'factura', currentValue: 0 },
  ]).onConflictDoNothing();

  await db.insert(settings).values([
    { key: 'shop_name', value: '' },
    { key: 'shop_phone', value: '' },
    { key: 'shop_id_number', value: '' },
    { key: 'receipt_footer', value: '' },
    { key: 'boleta_footer', value: '' },
    { key: 'quote_footer', value: '' },
    { key: 'auto_close_enabled', value: 'false' },
    { key: 'auto_close_time', value: '00:00' },
  ]).onConflictDoNothing();
}

export { sqlite };
