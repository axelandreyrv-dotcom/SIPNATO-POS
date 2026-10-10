export interface TenantExport {
  exportedAt: string;
  schemaVersion: string;
  tables: Record<string, Record<string, SqlStorageValue>[]>;
}

// `__migrations` es del runner, `sqlite_*` de SQLite y `_cf_*` de Durable Objects (su kv):
// ninguna es dato del negocio.
// GLOB y no LIKE: en GLOB el guion bajo no es comodín, así que no hace falta escapar nada.
const INTERNAL_TABLES = `name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name <> '__migrations'`;

// Vuelca todas las tablas del negocio (o de la plataforma) tal como están. Lee solo del `storage`
// del Durable Object que recibe, así que no puede traer filas de otro negocio. Es síncrono: la
// foto es consistente.
export function exportTenant(storage: DurableObjectStorage): TenantExport {
  const sql = storage.sql;
  const names = sql
    .exec(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND ${INTERNAL_TABLES} ORDER BY name`,
    )
    .toArray()
    .map((r) => String(r['name']));

  const tables: TenantExport['tables'] = {};
  for (const name of names) {
    // El nombre sale de sqlite_master, no del cliente; se entrecomilla por si trae caracteres raros.
    tables[name] = sql.exec(`SELECT * FROM "${name.replaceAll('"', '""')}"`).toArray();
  }

  // La BD de la plataforma no usa el runner de migraciones: no tiene __migrations.
  const hasMigrations =
    sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__migrations'").toArray()
      .length > 0;
  const last = hasMigrations
    ? sql.exec('SELECT tag FROM __migrations ORDER BY tag DESC LIMIT 1').toArray()[0]
    : undefined;
  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: last ? String(last['tag']) : '',
    tables,
  };
}
