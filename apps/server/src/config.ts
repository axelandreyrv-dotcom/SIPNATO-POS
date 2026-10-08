import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  // control.db + tenants/<slug>.db + backups/<slug>/ viven bajo este directorio
  DATA_DIR: z.string().default('./data'),
  LOG_PATH: z.string().default('./logs'),
  // Cada negocio vive en <slug>.<TENANT_BASE_DOMAIN>. En dev, "localhost" → taller.localhost:5173
  TENANT_BASE_DOMAIN: z.string().default('localhost'),
  // Solo desarrollo: negocio usado cuando el host no trae subdominio (http://localhost:5173)
  DEV_TENANT: z.string().optional(),
  // Dev usa un default explícito para no bloquear `pnpm dev` sin .env
  SESSION_SECRET: z
    .string()
    .min(64, 'SESSION_SECRET debe tener al menos 64 caracteres')
    .default('dosuxsoft-dev-secret-reemplazar-antes-de-produccion-abcdefghijklmnopqrstuvwxyz01'),
  ALLOWED_ORIGIN: z.string().default('http://localhost:5173'),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[DOSUXSOFT] Variables de entorno inválidas:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  if (
    result.data.NODE_ENV === 'production' &&
    result.data.SESSION_SECRET.startsWith('dosuxsoft-dev-secret')
  ) {
    console.error('[DOSUXSOFT] ERROR: SESSION_SECRET debe cambiarse en producción.');
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;
