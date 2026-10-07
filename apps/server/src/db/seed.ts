/**
 * Seed de datos para DESARROLLO únicamente.
 * Ejecutar: pnpm --filter @sipnato/server db:seed [slug]   (default: "demo")
 * Crea el negocio en control.db si no existe. NO ejecutar en producción.
 */
import { config } from '../config.js';

if (config.NODE_ENV === 'production') {
  console.error('[seed] ERROR: No ejecutar seed en producción.');
  process.exit(1);
}

import { db, runWithTenant } from './client.js';
import { findTenant, insertTenant, setSetupCodeHash } from './control.js';
import { customers, settings } from './schema.js';
import { generateSetupCode, hashSetupCode } from '../lib/crypto.js';
import { eq } from 'drizzle-orm';

const slug = process.argv[2] ?? 'demo';
if (!findTenant(slug)) {
  insertTenant(slug, `Negocio ${slug}`);
  const code = generateSetupCode();
  setSetupCodeHash(slug, await hashSetupCode(code));
  console.log(`[seed] Negocio "${slug}" creado · código de activación: ${code}`);
}

runWithTenant(slug, () => {
  const values: Record<string, string> = {
    shop_name: 'Dosuxsoft Taller',
    shop_phone: '88888888',
    shop_id_number: '3-101-000000',
    receipt_footer: 'Gracias por su preferencia.',
    boleta_footer: 'Tiempo de entrega estimado: 3-5 días hábiles.',
    quote_footer: 'Esta cotización tiene validez de 15 días.',
  };
  for (const [key, value] of Object.entries(values)) {
    db.update(settings).set({ value }).where(eq(settings.key, key)).run();
  }

  db.insert(customers)
    .values([
      { name: 'Juan Pérez', phone: '88001234', email: 'juan@example.com' },
      { name: 'María López', phone: '72005678' },
      { name: 'Carlos Mora', phone: '66009012', idNumber: '1-0234-0567' },
    ])
    .onConflictDoNothing()
    .run();
});

console.log(`[seed] ✅ Datos de prueba insertados en el negocio "${slug}".`);
