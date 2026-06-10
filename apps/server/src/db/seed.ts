/**
 * Seed de datos para DESARROLLO únicamente.
 * Ejecutar: pnpm --filter @sipnato/server db:seed
 * NO ejecutar en producción.
 */
import { config } from '../config.js';

if (config.NODE_ENV === 'production') {
  console.error('[seed] ERROR: No ejecutar seed en producción.');
  process.exit(1);
}

import { db, runMigrations } from './client.js';
import { counters, customers, settings } from './schema.js';

runMigrations();

// Settings iniciales del taller
await db
  .insert(settings)
  .values([
    { key: 'shop_name', value: 'SIPNATO Taller' },
    { key: 'shop_phone', value: '88888888' },
    { key: 'shop_id_number', value: '3-101-000000' },
    { key: 'receipt_footer', value: 'Gracias por su preferencia.' },
    { key: 'boleta_footer', value: 'Tiempo de entrega estimado: 3-5 días hábiles.' },
    { key: 'quote_footer', value: 'Esta cotización tiene validez de 15 días.' },
    { key: 'auto_close_enabled', value: 'false' },
    { key: 'auto_close_time', value: '00:00' },
  ])
  .onConflictDoNothing();

// Contadores en cero
await db
  .insert(counters)
  .values([
    { type: 'sale', currentValue: 0 },
    { type: 'boleta', currentValue: 0 },
    { type: 'quote', currentValue: 0 },
  ])
  .onConflictDoNothing();

// Clientes de prueba
await db
  .insert(customers)
  .values([
    { name: 'Juan Pérez', phone: '88001234', email: 'juan@example.com' },
    { name: 'María López', phone: '72005678' },
    { name: 'Carlos Mora', phone: '66009012', idNumber: '1-0234-0567' },
  ])
  .onConflictDoNothing();

console.log('[seed] ✅ Datos de prueba insertados correctamente.');
