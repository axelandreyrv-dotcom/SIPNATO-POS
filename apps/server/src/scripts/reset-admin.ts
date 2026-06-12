/**
 * Break-glass script — ejecutar SOLO por SSH en el VPS.
 * Resetea la contraseña del admin cuando se pierde acceso.
 *
 * Uso (en el contenedor de producción, código ya compilado):
 *   docker exec -it deploy-server-1 node dist/scripts/reset-admin.js
 *
 * Uso (desarrollo local):
 *   cd apps/server
 *   tsx src/scripts/reset-admin.ts
 *
 * Seguridad:
 *   - Solo funciona con acceso local al servidor (SSH por clave).
 *   - NO es un endpoint HTTP — no tiene exposición remota.
 *   - Invalida TODAS las sesiones activas antes de finalizar.
 */

import { randomBytes } from 'crypto';
import { bootstrapDb, db, runMigrations } from '../db/client.js';
import { admin, sessions, auditLog } from '../db/schema.js';
import { hashPassword, generateRecoveryCode, hashRecoveryCode } from '../lib/crypto.js';
import { eq } from 'drizzle-orm';

runMigrations();
await bootstrapDb();

const [existingAdmin] = await db.select().from(admin).limit(1);

if (!existingAdmin) {
  console.error('\n[reset-admin] ERROR: No hay admin configurado. Usar /auth/setup en la app.\n');
  process.exit(1);
}

// Genera contraseña temporal de 12 chars legibles
const tempPassword = randomBytes(9).toString('base64url').slice(0, 12);
const newPasswordHash = await hashPassword(tempPassword);
const newRecoveryCode = generateRecoveryCode();
const newRecoveryCodeHash = await hashRecoveryCode(newRecoveryCode);

// Revoca todas las sesiones activas
await db.delete(sessions);

// Actualiza credenciales del admin
await db
  .update(admin)
  .set({
    passwordHash: newPasswordHash,
    recoveryCodeHash: newRecoveryCodeHash,
    updatedAt: new Date().toISOString(),
  })
  .where(eq(admin.id, 1));

// Registro en audit_log
await db.insert(auditLog).values({
  action: 'BREAK_GLASS_RESET',
  entityType: 'admin',
  entityId: '1',
  ip: null,
  userAgent: 'reset-admin-script',
});

console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║           Dosuxsoft — RESET DE EMERGENCIA          ║');
console.log('╠══════════════════════════════════════════════════╣');
console.log(`║  Contraseña temporal : ${tempPassword.padEnd(24)} ║`);
console.log(`║  Recovery code nuevo : ${newRecoveryCode.slice(0, 16)}...   ║`);
console.log('╠══════════════════════════════════════════════════╣');
console.log('║  ⚠  Cambia la contraseña al iniciar sesión.      ║');
console.log('║  ⚠  El recovery code completo está abajo.        ║');
console.log('╚══════════════════════════════════════════════════╝\n');
console.log(`Recovery code completo: ${newRecoveryCode}\n`);
