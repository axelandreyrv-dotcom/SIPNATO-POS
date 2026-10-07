/**
 * Superadministradores del panel (admin.<dominio>) — ejecutar con acceso directo al servidor.
 * No hay alta por HTTP: quien controla el panel controla todos los negocios.
 *
 *   superadmin create <usuario>    crea la cuenta e imprime una contraseña temporal
 *   superadmin reset <usuario>     contraseña temporal nueva, desbloquea y cierra sus sesiones
 *   superadmin disable <usuario>   desactiva la cuenta y cierra sus sesiones
 *   superadmin enable <usuario>    reactiva la cuenta
 *   superadmin list
 *
 * Producción: docker exec -it deploy-server-1 node apps/server/dist/scripts/superadmin.js <comando>
 * Desarrollo: pnpm --filter @sipnato/server superadmin <comando>
 */

import { randomBytes } from 'crypto';
import { superadminUsernameSchema } from '@sipnato/shared';
import { hashPassword } from '../lib/crypto.js';
import {
  deleteSuperadminSessions,
  findSuperadminByUsername,
  insertSuperadmin,
  listSuperadmins,
  setSuperadminActive,
  updateSuperadminPassword,
} from '../modules/platform/repository.js';

const [command, rawUsername] = process.argv.slice(2);

function fail(message: string): never {
  console.error(`\n[superadmin] ${message}\n`);
  process.exit(1);
}

// 18 bytes → 24 caracteres base64url: se copia una vez y se cambia en el panel.
function temporaryPassword(): string {
  return randomBytes(18).toString('base64url');
}

function requireUsername(): string {
  const parsed = superadminUsernameSchema.safeParse(rawUsername ?? '');
  if (!parsed.success) fail(`Uso: superadmin ${command} <usuario>  — ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

function existing(username: string) {
  const admin = findSuperadminByUsername(username);
  if (!admin) fail(`No existe el superadministrador "${username}".`);
  return admin;
}

function printPassword(username: string, password: string): void {
  console.log(`         Usuario: ${username}`);
  console.log(`         Contraseña temporal: ${password}`);
  console.log('         Entra a https://admin.<dominio> y cámbiala en "Mi cuenta".\n');
}

switch (command) {
  case 'create': {
    const username = requireUsername();
    if (findSuperadminByUsername(username)) fail(`"${username}" ya existe. Usa: superadmin reset ${username}`);
    const password = temporaryPassword();
    insertSuperadmin(username, await hashPassword(password));
    console.log('\n[superadmin] ✅ Cuenta creada.');
    printPassword(username, password);
    break;
  }

  case 'reset': {
    const admin = existing(requireUsername());
    const password = temporaryPassword();
    updateSuperadminPassword(admin.id, await hashPassword(password));
    deleteSuperadminSessions(admin.id);
    console.log('\n[superadmin] Contraseña restablecida; sesiones abiertas cerradas.');
    printPassword(admin.username, password);
    break;
  }

  case 'disable':
  case 'enable': {
    const admin = existing(requireUsername());
    setSuperadminActive(admin.id, command === 'enable');
    if (command === 'disable') deleteSuperadminSessions(admin.id);
    console.log(`\n[superadmin] "${admin.username}" → ${command === 'enable' ? 'activo' : 'desactivado'}\n`);
    break;
  }

  case 'list': {
    const rows = listSuperadmins().map((a) => ({
      usuario: a.username,
      activo: a.active === 1,
      bloqueado: a.locked_until !== null && new Date(a.locked_until).getTime() > Date.now(),
      creado: a.created_at,
    }));
    if (rows.length === 0) console.log('\n[superadmin] No hay superadministradores.\n');
    else console.table(rows);
    break;
  }

  default:
    fail('Comandos: create <usuario> | reset <usuario> | disable <usuario> | enable <usuario> | list');
}
