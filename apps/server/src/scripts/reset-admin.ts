/**
 * Break-glass script — ejecutar SOLO con acceso directo al servidor.
 * Resetea la contraseña del DUEÑO de un negocio cuando se pierde acceso.
 * (Admins y cajeros los restablece el dueño desde la pantalla de Usuarios.)
 *
 * Uso (en el contenedor de producción, código ya compilado):
 *   docker exec -it deploy-server-1 node apps/server/dist/scripts/reset-admin.js <slug>
 *
 * Uso (desarrollo local):
 *   cd apps/server
 *   tsx src/scripts/reset-admin.ts <slug>
 *
 * Seguridad:
 *   - Solo funciona con acceso local al servidor.
 *   - NO es un endpoint HTTP — no tiene exposición remota.
 *   - Invalida todas las sesiones del dueño y lo desbloquea.
 */

import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { db, runWithTenant } from '../db/client.js';
import { findTenant } from '../db/control.js';
import { auditLog, sessions, users } from '../db/schema.js';
import { hashPassword, generateRecoveryCode, hashRecoveryCode } from '../lib/crypto.js';

const slug = process.argv[2];
if (!slug || !findTenant(slug)) {
  console.error(
    '\n[reset-admin] Uso: reset-admin <slug>  — el negocio debe existir (ver: tenant list).\n',
  );
  process.exit(1);
}

// Genera contraseña temporal de 12 chars legibles
const tempPassword = randomBytes(9).toString('base64url').slice(0, 12);
const newPasswordHash = await hashPassword(tempPassword);
const newRecoveryCode = generateRecoveryCode();
const newRecoveryCodeHash = await hashRecoveryCode(newRecoveryCode);

const username = runWithTenant(slug, () => {
  const dueno = db.select().from(users).where(eq(users.role, 'dueno')).get();
  if (!dueno) {
    console.error(
      `\n[reset-admin] ERROR: "${slug}" no tiene dueño configurado. Usar /setup en la app.\n`,
    );
    process.exit(1);
  }

  db.transaction((tx) => {
    tx.delete(sessions).where(eq(sessions.userId, dueno.id)).run();

    tx.update(users)
      .set({
        secretHash: newPasswordHash,
        recoveryCodeHash: newRecoveryCodeHash,
        active: true,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, dueno.id))
      .run();

    tx.insert(auditLog)
      .values({
        action: 'BREAK_GLASS_RESET',
        entityType: 'user',
        entityId: String(dueno.id),
        ip: null,
        userAgent: 'reset-admin-script',
      })
      .run();
  });

  return dueno.username;
});

console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║           Dosuxsoft — RESET DE EMERGENCIA          ║');
console.log('╠══════════════════════════════════════════════════╣');
console.log(`║  Negocio             : ${slug.padEnd(24)} ║`);
console.log(`║  Usuario (dueño)     : ${username.padEnd(24)} ║`);
console.log(`║  Contraseña temporal : ${tempPassword.padEnd(24)} ║`);
console.log(`║  Recovery code nuevo : ${newRecoveryCode.slice(0, 16)}...   ║`);
console.log('╠══════════════════════════════════════════════════╣');
console.log('║  ⚠  Cambia la contraseña al iniciar sesión.      ║');
console.log('║  ⚠  El recovery code completo está abajo.        ║');
console.log('╚══════════════════════════════════════════════════╝\n');
console.log(`Recovery code completo: ${newRecoveryCode}\n`);
