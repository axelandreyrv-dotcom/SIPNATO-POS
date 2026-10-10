// Orden del journal de Drizzle (migrations/meta/_journal.json). Una migración nueva se agrega aquí
// con su import y al final de MIGRATIONS.
import type { Migration } from './migrator.js';
import m0000 from './migrations/0000_curly_yellowjacket.sql';
import m0001 from './migrations/0001_even_maverick.sql';
import m0002 from './migrations/0002_cultured_thena.sql';
import m0003 from './migrations/0003_greedy_dazzler.sql';
import m0004 from './migrations/0004_sturdy_marvel_zombies.sql';
import m0005 from './migrations/0005_loud_bruce_banner.sql';
import m0006 from './migrations/0006_creditos.sql';
import m0007 from './migrations/0007_usuarios.sql';
import m0008 from './migrations/0008_inventario.sql';
import m0009 from './migrations/0009_perfil_negocio.sql';
import m0010 from './migrations/0010_dolares_avisos.sql';

export const MIGRATIONS: Migration[] = [
  { tag: '0000_curly_yellowjacket', sql: m0000 },
  { tag: '0001_even_maverick', sql: m0001 },
  { tag: '0002_cultured_thena', sql: m0002 },
  { tag: '0003_greedy_dazzler', sql: m0003 },
  { tag: '0004_sturdy_marvel_zombies', sql: m0004 },
  { tag: '0005_loud_bruce_banner', sql: m0005 },
  { tag: '0006_creditos', sql: m0006 },
  { tag: '0007_usuarios', sql: m0007 },
  { tag: '0008_inventario', sql: m0008 },
  { tag: '0009_perfil_negocio', sql: m0009 },
  { tag: '0010_dolares_avisos', sql: m0010 },
];
