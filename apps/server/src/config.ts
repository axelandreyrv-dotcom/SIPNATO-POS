import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  // control.db + tenants/<slug>.db + backups/<slug>/ viven bajo este directorio
  DATA_DIR: z.string().default('./data'),
  // Cada negocio vive en <slug>.<TENANT_BASE_DOMAIN>. En dev, "localhost" → taller.localhost:5174
  TENANT_BASE_DOMAIN: z.string().default('localhost'),
  // Solo desarrollo: negocio usado cuando el host no trae subdominio (http://localhost:5174)
  DEV_TENANT: z.string().optional(),
  // Token Bearer del API SDDE del BCCR (tipo de cambio). Sin él, cada negocio usa su
  // tipo de cambio de respaldo manual. Uno para toda la plataforma.
  BCCR_API_TOKEN: z.string().optional(),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[DOSUXSOFT] Variables de entorno inválidas:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
