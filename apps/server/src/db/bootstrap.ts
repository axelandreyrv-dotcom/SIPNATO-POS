import type { TenantDb } from './client.js';
import { counters, settings } from './schema.js';

// Inserta datos estructurales mínimos que deben existir en cualquier negocio.
// Idempotente — onConflictDoNothing garantiza que no rompe si ya existen.
export function bootstrapTenant(db: TenantDb): void {
  db.insert(counters)
    .values([
      { type: 'sale', currentValue: 0 },
      { type: 'boleta', currentValue: 0 },
      { type: 'quote', currentValue: 0 },
      { type: 'apartado', currentValue: 0 },
      { type: 'factura', currentValue: 0 },
      { type: 'credito', currentValue: 0 },
    ])
    .onConflictDoNothing()
    .run();

  db.insert(settings)
    .values([
      { key: 'shop_name', value: '' },
      { key: 'shop_phone', value: '' },
      { key: 'shop_id_number', value: '' },
      { key: 'receipt_footer', value: '' },
      { key: 'boleta_footer', value: '' },
      { key: 'quote_footer', value: '' },
      { key: 'auto_close_enabled', value: 'false' },
      { key: 'auto_close_time', value: '00:00' },
    ])
    .onConflictDoNothing()
    .run();
}
