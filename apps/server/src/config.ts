import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().default('./data/sipnato.db'),
  BACKUP_PATH: z.string().default('./data/backups'),
  LOG_PATH: z.string().default('./logs'),
  // Dev usa un default explícito para no bloquear `pnpm dev` sin .env
  SESSION_SECRET: z
    .string()
    .min(64, 'SESSION_SECRET debe tener al menos 64 caracteres')
    .default('sipnato-dev-secret-reemplazar-antes-de-produccion-abcdefghijklmnopqrstuvwxyz01'),
  ALLOWED_ORIGIN: z.string().default('http://localhost:5173'),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[SIPNATO] Variables de entorno inválidas:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  if (
    result.data.NODE_ENV === 'production' &&
    result.data.SESSION_SECRET.startsWith('sipnato-dev-secret')
  ) {
    console.error('[SIPNATO] ERROR: SESSION_SECRET debe cambiarse en producción.');
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;
