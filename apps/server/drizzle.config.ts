import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  // Solo para `db:studio` (inspeccionar UN negocio). `db:generate` no usa BD, y las
  // migraciones se aplican solas a cada negocio al abrir su BD (openTenantDb).
  dbCredentials: {
    url: `./data/tenants/${process.env['TENANT'] ?? 'taller'}.db`,
  },
});
