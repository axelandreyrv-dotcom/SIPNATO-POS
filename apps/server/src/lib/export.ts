export interface TenantExport {
  exportedAt: string;
  schemaVersion: string;
  tables: Record<string, unknown[]>;
}

// `__migrations` es del runner, `sqlite_*` de SQLite y `_cf_*` de Durable Objects (su kv):
// ninguna es dato del negocio.
// GLOB y no LIKE: en GLOB el guion bajo no es comodín, así que no hace falta escapar nada.
const INTERNAL_TABLES = `name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name <> '__migrations'`;

// Vuelca todas las tablas del negocio tal como están. Lee solo del `storage` del Durable Object
// que recibe, así que no puede traer filas de otro negocio. Es síncrono: la foto es consistente.
export function exportTenant(storage: DurableObjectStorage): TenantExport {
  const sql = storage.sql;
  const names = sql
    .exec(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND ${INTERNAL_TABLES} ORDER BY name`,
    )
    .toArray()
    .map((r) => String(r['name']));

  const tables: Record<string, unknown[]> = {};
  for (const name of names) {
    // El nombre sale de sqlite_master, no del cliente; se entrecomilla por si trae caracteres raros.
    tables[name] = sql.exec(`SELECT * FROM "${name.replaceAll('"', '""')}"`).toArray();
  }

  const last = sql.exec('SELECT tag FROM __migrations ORDER BY tag DESC LIMIT 1').toArray()[0];
  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: last ? String(last['tag']) : '',
    tables,
  };
}
