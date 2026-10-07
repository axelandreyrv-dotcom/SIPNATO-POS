/**
 * Administración de negocios (tenants) — ejecutar con acceso directo al servidor.
 * Lo habitual es usar el panel de superadministrador (admin.<dominio>); esto queda como respaldo.
 *
 *   tenant create <slug> "<nombre>"   crea el negocio y su BD, e imprime el código de activación
 *   tenant setup-code <slug>          emite un código de activación nuevo (solo si aún no hay admin)
 *   tenant list                       lista negocios y su estado
 *   tenant suspend <slug>             bloquea el acceso (los datos se conservan)
 *   tenant activate <slug>            reactiva un negocio suspendido
 *
 * Producción: docker exec -it deploy-server-1 node apps/server/dist/scripts/tenant.js <comando>
 * Desarrollo: pnpm --filter @sipnato/server tenant <comando>
 */

import { db, openTenantDb, runWithTenant, tenantDbPath } from '../db/client.js';
import {
  findTenant,
  insertTenant,
  isValidSlug,
  listTenants,
  setTenantStatus,
} from '../db/control.js';
import { users } from '../db/schema.js';
import { issueSetupCode } from '../modules/platform/service.js';

const [command, slug, ...rest] = process.argv.slice(2);

function fail(message: string): never {
  console.error(`\n[tenant] ${message}\n`);
  process.exit(1);
}

function printSetupCode(tenantSlug: string, code: string): void {
  console.log(`         Código de activación: ${code}`);
  console.log(
    `         Entrégalo al dueño junto con https://${tenantSlug}.<dominio> — lo pide /setup`,
  );
  console.log('         una sola vez. Si se pierde: tenant setup-code <slug>\n');
}

switch (command) {
  case 'create': {
    const name = rest.join(' ').trim();
    if (!slug || !name) fail('Uso: tenant create <slug> "<nombre>"');
    if (!isValidSlug(slug))
      fail(`Slug inválido o reservado: "${slug}" (minúsculas, dígitos y guiones, máx. 32)`);
    if (findTenant(slug)) fail(`El negocio "${slug}" ya existe.`);

    insertTenant(slug, name);
    openTenantDb(slug);
    const code = await issueSetupCode(slug);
    console.log(`\n[tenant] ✅ Negocio "${name}" creado.`);
    console.log(`         BD: ${tenantDbPath(slug)}`);
    printSetupCode(slug, code);
    break;
  }

  case 'setup-code': {
    if (!slug || !findTenant(slug))
      fail('Uso: tenant setup-code <slug>  — el negocio debe existir.');
    const hasDueno = runWithTenant(slug, () =>
      db.select({ id: users.id }).from(users).limit(1).get(),
    );
    if (hasDueno) fail(`"${slug}" ya tiene dueño. Para recuperar acceso usar reset-admin ${slug}.`);
    const code = await issueSetupCode(slug);
    console.log(`\n[tenant] Nuevo código para "${slug}" (el anterior quedó invalidado).`);
    printSetupCode(slug, code);
    break;
  }

  case 'list': {
    const tenants = listTenants();
    if (tenants.length === 0) console.log('\n[tenant] No hay negocios registrados.\n');
    else console.table(tenants);
    break;
  }

  case 'suspend':
  case 'activate': {
    if (!slug) fail(`Uso: tenant ${command} <slug>`);
    const status = command === 'suspend' ? 'suspended' : 'active';
    if (!setTenantStatus(slug, status)) fail(`No existe el negocio "${slug}".`);
    console.log(`\n[tenant] "${slug}" → ${status}\n`);
    break;
  }

  default:
    fail(
      'Comandos: create <slug> "<nombre>" | setup-code <slug> | list | suspend <slug> | activate <slug>',
    );
}
