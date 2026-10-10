export type Migration = { tag: string; sql: string };

const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

// Tablas internas de SQLite y de Durable Objects (`_cf_KV`) no cuentan como datos del negocio.
function hasBusinessTables(sql: SqlStorage): boolean {
  const row = sql
    .exec(
      `SELECT COUNT(*) AS n FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
         AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name <> '__migrations'`,
    )
    .one();
  return Number(row['n']) > 0;
}

// Aplica en orden las migraciones que faltan, cada archivo en su propia transacción: si una
// falla no queda a medias ni registrada, y el DO no arranca (lo corrige un despliegue nuevo).
// Antes de tocar una BD con datos guarda el bookmark de recuperación a un punto en el tiempo
// (`pre-migracion:<tag>`), que es lo que permite volver atrás si la migración sale mal.
// Debe llamarse dentro de `blockConcurrencyWhile`: el bookmark es asíncrono.
export async function runMigrations(
  storage: DurableObjectStorage,
  migrations: Migration[],
): Promise<{ applied: string[]; bookmark: string | null }> {
  const sql = storage.sql;
  sql.exec('CREATE TABLE IF NOT EXISTS __migrations (tag TEXT PRIMARY KEY, applied_at TEXT)');
  const done = new Set(
    sql
      .exec('SELECT tag FROM __migrations')
      .toArray()
      .map((r) => String(r['tag'])),
  );
  const pending = migrations.filter((m) => !done.has(m.tag));
  const first = pending[0];
  if (!first) return { applied: [], bookmark: null };

  let bookmark: string | null = null;
  if (hasBusinessTables(sql)) {
    bookmark = await storage.getCurrentBookmark();
    storage.kv.put(`pre-migracion:${first.tag}`, bookmark);
  }

  for (const migration of pending) {
    storage.transactionSync(() => {
      for (const raw of migration.sql.split(STATEMENT_BREAKPOINT)) {
        const statement = raw.trim();
        if (!statement) continue;
        try {
          sql.exec(statement);
        } catch (err) {
          // PRAGMA foreign_keys no se puede cambiar dentro de una transacción: la migración
          // 0001 lo intenta y su efecto no hace falta en un DO nuevo.
          if (/^PRAGMA/i.test(statement)) continue;
          throw err;
        }
      }
      sql.exec(
        'INSERT INTO __migrations (tag, applied_at) VALUES (?, ?)',
        migration.tag,
        new Date().toISOString(),
      );
    });
  }
  return { applied: pending.map((m) => m.tag), bookmark };
}
