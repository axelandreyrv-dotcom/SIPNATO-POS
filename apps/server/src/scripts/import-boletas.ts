/**
 * Script de importación de boletas desde el sistema anterior.
 * Uso: pnpm --filter @sipnato/server exec tsx src/scripts/import-boletas.ts <ruta-al-json>
 *
 * El JSON debe tener la forma: { "boletas": [...] }
 * Cada boleta viene del respaldo del sistema anterior (campos en español).
 *
 * Ejecutar SOLO en la instancia vacía antes de arrancar operaciones en el nuevo sistema.
 * Si ya hay boletas en la BD, detiene la ejecución.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, runMigrations } from '../db/client.js';
import { boletas, counters, customers } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// ── Tipos del respaldo ────────────────────────────────────────────────────────

interface OldBoleta {
  numero: number;
  fecha: string; // YYYY-MM-DD
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_direccion: string;
  marca: string;
  modelo: string;
  imei: string;
  reparacion: string;
  dano: string;
  info_adicional: string;
  codigo: string;
  patron: string;
  precio: number;
  adelanto: number;
  saldo: number;
  recibido_por: string;
  estado: string;
  creado: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normaliza el teléfono: solo dígitos, primeros 8. '' si no llega a 8 dígitos. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  return digits.length === 8 ? digits : '';
}

/**
 * Convierte "DD/MM/YYYY HH:MM AM/PM" (hora Costa Rica UTC-6) a ISO UTC.
 * Si viene null o mal formateado, usa la fecha del campo `fecha` a medianoche CR.
 */
function parseCreatedAt(creado: string | null, fecha: string): string {
  if (creado) {
    // "13/06/2026 10:47 AM"
    const match = creado.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i);
    if (match) {
      const [, dd, mm, yyyy, hRaw, min, ampm] = match;
      let h = parseInt(hRaw!);
      if (ampm!.toUpperCase() === 'PM' && h !== 12) h += 12;
      if (ampm!.toUpperCase() === 'AM' && h === 12) h = 0;
      // CR = UTC-6 → add 6 hours to get UTC
      const crDate = new Date(
        Date.UTC(parseInt(yyyy!), parseInt(mm!) - 1, parseInt(dd!), h, parseInt(min!), 0),
      );
      crDate.setUTCHours(crDate.getUTCHours() + 6);
      return crDate.toISOString().replace('T', ' ').slice(0, 19);
    }
  }
  // Fallback: midnight CR (06:00 UTC)
  const [yyyy, mm, dd] = fecha.split('-');
  return `${yyyy}-${mm}-${dd} 06:00:00`;
}

/** Construye el deviceModel combinando marca y modelo. */
function buildDeviceModel(marca: string, modelo: string): string {
  const parts = [marca.trim(), modelo.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Sin especificar';
}

/** Construye la descripción unificada desde todos los campos de texto. */
function buildDescription(b: OldBoleta): string {
  const lines: string[] = [];

  if (b.reparacion.trim()) lines.push(`Reparación: ${b.reparacion.trim()}`);
  if (b.dano.trim()) lines.push(`Daño: ${b.dano.trim()}`);
  if (b.info_adicional.trim()) lines.push(`Notas: ${b.info_adicional.trim()}`);
  if (b.recibido_por.trim()) lines.push(`Recibido por: ${b.recibido_por.trim()}`);
  if (b.cliente_direccion.trim()) lines.push(`Dirección: ${b.cliente_direccion.trim()}`);

  // Conservar precio/adelanto/saldo como referencia histórica
  const precio = Math.round(b.precio);
  const adelanto = Math.round(b.adelanto);
  const saldo = Math.round(b.saldo);
  if (precio > 0 || adelanto > 0) {
    lines.push(
      `Precio estimado: ₡${precio.toLocaleString()} | Adelanto: ₡${adelanto.toLocaleString()} | Saldo: ₡${saldo.toLocaleString()}`,
    );
  }

  if (b.estado && b.estado !== 'abierta') lines.push(`Estado anterior: ${b.estado}`);

  return lines.length > 0 ? lines.join('\n') : 'Importado del sistema anterior';
}

/** Combina codigo + patron en unlockPassword. */
function buildUnlockPassword(codigo: string, patron: string): string | undefined {
  const parts: string[] = [];
  if (codigo.trim()) parts.push(`PIN/Código: ${codigo.trim()}`);
  if (patron.trim()) parts.push(`Patrón: ${patron.trim()}`);
  return parts.length > 0 ? parts.join(' | ') : undefined;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('[import] Uso: tsx src/scripts/import-boletas.ts <ruta-al-json>');
  process.exit(1);
}

const absolutePath = resolve(jsonPath);
console.log(`[import] Leyendo: ${absolutePath}`);

let raw: { boletas: OldBoleta[] };
try {
  raw = JSON.parse(readFileSync(absolutePath, 'utf-8')) as { boletas: OldBoleta[] };
} catch (err) {
  console.error('[import] Error leyendo el archivo JSON:', err);
  process.exit(1);
}

if (!Array.isArray(raw.boletas) || raw.boletas.length === 0) {
  console.error('[import] El archivo no contiene un array "boletas" válido.');
  process.exit(1);
}

runMigrations();

// Verificar que la BD está vacía de boletas
const existing = db.select({ id: boletas.id }).from(boletas).limit(1).get();
if (existing) {
  console.error('[import] ERROR: Ya existen boletas en la BD. Abortar para no duplicar.');
  process.exit(1);
}

const oldBoletas = raw.boletas.sort((a, b) => a.numero - b.numero);
console.log(`[import] ${oldBoletas.length} boletas a importar.`);

let customersCreated = 0;
let customersReused = 0;
let boletasImported = 0;
let maxConsecutive = 0;

// Caché de teléfono → customerId para evitar duplicados en el mismo run
const phoneCache = new Map<string, number>();

db.transaction(() => {
  for (const old of oldBoletas) {
    const phone = normalizePhone(old.cliente_telefono);
    const name = old.cliente_nombre.trim() || 'Sin nombre';

    // ── Buscar o crear cliente ──────────────────────────────────────────────
    let customerId: number;

    if (phone && phoneCache.has(phone)) {
      customerId = phoneCache.get(phone)!;
      customersReused++;
    } else if (phone) {
      const existing = db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.phone, phone))
        .get();

      if (existing) {
        customerId = existing.id;
        customersReused++;
        phoneCache.set(phone, customerId);
      } else {
        const inserted = db
          .insert(customers)
          .values({
            name,
            phone,
            address: old.cliente_direccion.trim() || null,
          })
          .returning({ id: customers.id })
          .get();
        customerId = inserted.id;
        customersCreated++;
        phoneCache.set(phone, customerId);
      }
    } else {
      // Sin teléfono: crear cliente genérico (sin deduplicar)
      const inserted = db
        .insert(customers)
        .values({ name, phone: '00000000' })
        .returning({ id: customers.id })
        .get();
      customerId = inserted.id;
      customersCreated++;
    }

    // ── Insertar boleta ────────────────────────────────────────────────────
    const deviceModel = buildDeviceModel(old.marca, old.modelo);
    const description = buildDescription(old);
    const unlockPassword = buildUnlockPassword(old.codigo, old.patron);
    const createdAt = parseCreatedAt(old.creado, old.fecha);

    db.insert(boletas)
      .values({
        customerId,
        consecutive: old.numero,
        deviceModel,
        description,
        unlockPassword: unlockPassword ?? null,
        createdAt,
        updatedAt: createdAt,
      })
      .run();

    if (old.numero > maxConsecutive) maxConsecutive = old.numero;
    boletasImported++;

    if (boletasImported % 20 === 0) {
      process.stdout.write(`  → ${boletasImported}/${oldBoletas.length} boletas...\r`);
    }
  }

  // Actualizar el contador de boletas al valor máximo importado
  db.update(counters)
    .set({ currentValue: maxConsecutive })
    .where(eq(counters.type, 'boleta'))
    .run();
});

console.log(`
[import] ✅ Importación completada:
  - Boletas importadas : ${boletasImported}
  - Clientes creados   : ${customersCreated}
  - Clientes reutilizados: ${customersReused}
  - Contador boleta     → ${maxConsecutive}
  - Próxima boleta será : #${maxConsecutive + 1}
`);
