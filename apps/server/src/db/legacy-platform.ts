import { withTimeout } from '../lib/timeout.js';
import { controlDb, controlTransaction, runInPlatform } from './control.js';

// La plataforma pasó a otro Durable Object (ver PLATFORM_OBJECT_NAME): el nuevo copia una sola vez
// lo que tenía el original. Marca en el kv del nuevo: la copia ya se hizo (o no había nada).
export const LEGACY_IMPORT_FLAG = 'migrated-from-legacy';

// En orden de dependencia (los pagos referencian negocios y superadministradores). Sin
// platform_sessions: obligar a iniciar sesión otra vez no cuesta nada y no se copian hashes de tokens.
const LEGACY_TABLES = [
  'superadmins',
  'tenants',
  'subscription_payments',
  'platform_settings',
  'platform_audit_log',
  'exchange_rates',
] as const;

export type ControlTables = Partial<Record<string, Record<string, SqlStorageValue>[]>>;

export type LegacyImportResult = 'done' | 'skipped' | 'empty' | 'imported';

// Muy por debajo de los 30 s que permite blockConcurrencyWhile.
export const LEGACY_FETCH_TIMEOUT_MS = 10_000;

// Pueden existir ya en el objeto nuevo sin que eso sea "datos propios" (p. ej. si el cron del tipo
// de cambio corrió antes): ahí gana lo que ya está. En las demás tablas un choque es un error.
const MERGEABLE_TABLES: readonly string[] = ['platform_settings', 'exchange_rates'];

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

// Dentro de runInPlatform: todas las filas de las tablas que se migran, con sus ids.
export function exportControlTables(): ControlTables {
  const tables: ControlTables = {};
  for (const table of LEGACY_TABLES) {
    tables[table] = controlDb
      .prepare<[], Record<string, SqlStorageValue>>(`SELECT * FROM ${quote(table)}`)
      .all();
  }
  return tables;
}

function hasOwnData(): boolean {
  const row = controlDb
    .prepare<
      [],
      { n: number }
    >('SELECT (SELECT COUNT(*) FROM superadmins) + (SELECT COUNT(*) FROM tenants) AS n')
    .get();
  return (row?.n ?? 0) > 0;
}

// Copia las filas tal cual (ids incluidos, así la bitácora y los pagos siguen apuntando a quien
// corresponde). Solo columnas que existen aquí: el esquema es el mismo código, pero un nombre que
// llega por RPC nunca se mete a ciegas en el SQL.
function insertRows(tables: ControlTables): number {
  let total = 0;
  for (const table of LEGACY_TABLES) {
    const rows = tables[table] ?? [];
    if (rows.length === 0) continue;
    const columns = new Set(
      controlDb
        .prepare<[], { name: string }>(`SELECT name FROM pragma_table_info('${table}')`)
        .all()
        .map((c) => c.name),
    );
    for (const row of rows) {
      const keys = Object.keys(row).filter((k) => columns.has(k));
      const verb = MERGEABLE_TABLES.includes(table) ? 'INSERT OR IGNORE' : 'INSERT';
      controlDb
        .prepare(
          `${verb} INTO ${quote(table)} (${keys.map(quote).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
        )
        .run(...keys.map((k) => row[k]));
      total++;
    }
  }
  return total;
}

// Lo llama el constructor del objeto nuevo (dentro de blockConcurrencyWhile, antes de atender
// nada). Con la marca puesta es una lectura del kv. Falla cerrado: si el objeto viejo no responde
// (o la copia falla) lanza sin marcar, el objeto se reinicia sin haber atendido nada y la próxima
// petición lo reintenta. Atender con control.db vacío dejaría filas (bitácora, tipo de cambio,
// un superadministrador) que después chocarían con la copia o la harían saltarse.
export async function importLegacyControl(
  storage: DurableObjectStorage,
  fetchLegacy: () => Promise<ControlTables>,
  timeoutMs = LEGACY_FETCH_TIMEOUT_MS,
): Promise<LegacyImportResult> {
  if (storage.kv.get(LEGACY_IMPORT_FLAG) !== undefined) return 'done';
  if (runInPlatform(storage, hasOwnData)) {
    storage.kv.put(LEGACY_IMPORT_FLAG, true);
    return 'skipped';
  }

  let tables: ControlTables;
  try {
    tables = await withTimeout(fetchLegacy(), timeoutMs);
  } catch (err) {
    console.error(
      'No se pudo leer la plataforma anterior; se reintenta en la próxima petición:',
      (err as Error)?.message ?? String(err),
    );
    throw err;
  }

  // La transacción deshace lo copiado si algo falla.
  try {
    return runInPlatform(storage, () =>
      controlTransaction(() => {
        const copied = insertRows(tables);
        storage.kv.put(LEGACY_IMPORT_FLAG, true);
        if (copied > 0) console.log(`Plataforma anterior migrada: ${copied} filas`);
        return copied > 0 ? 'imported' : 'empty';
      }),
    );
  } catch (err) {
    console.error(
      'No se pudo copiar la plataforma anterior; se reintenta en la próxima petición:',
      (err as Error)?.message ?? String(err),
    );
    throw err;
  }
}
