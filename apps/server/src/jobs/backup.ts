import cron from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { currentTenant, tenantBackupDir } from '../db/client.js';
import { forEachActiveTenant } from './for-each-tenant.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const DATED_BACKUP_RE = /^\d{4}-\d{2}-\d{2}\.db$/;

export function latestBackupPath(slug: string): string {
  return join(tenantBackupDir(slug), 'latest.db');
}

// Debe correr dentro del contexto del negocio (forEachActiveTenant).
// Cada negocio respalda en su propia carpeta: backups/<slug>/YYYY-MM-DD.db + latest.db
async function backupCurrentTenant(slug: string, log: FastifyBaseLogger): Promise<void> {
  const dir = tenantBackupDir(slug);
  mkdirSync(dir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const dst = join(dir, `${date}.db`);

  await currentTenant().sqlite.backup(dst);
  copyFileSync(dst, latestBackupPath(slug));

  // Rotar: eliminar backups con más de 30 días
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  readdirSync(dir)
    .filter(f => DATED_BACKUP_RE.test(f))
    .map(f => join(dir, f))
    .filter(p => statSync(p).mtimeMs < cutoff)
    .forEach(p => { unlinkSync(p); log.info({ file: p }, 'backup rotado'); });

  log.info({ dst }, 'backup diario completado');
}

export async function runDailyBackup(log: FastifyBaseLogger): Promise<void> {
  await forEachActiveTenant(log, 'backup', backupCurrentTenant);
}

// 03:00 AM Costa Rica = 09:00 UTC (UTC-6 permanente, sin horario de verano)
export function startBackupCron(log: FastifyBaseLogger): void {
  // Respaldo inicial para negocios que aún no tienen uno, así la descarga funciona desde el día uno.
  void forEachActiveTenant(log, 'backup-inicial', async (slug, tenantLog) => {
    if (!existsSync(latestBackupPath(slug))) await backupCurrentTenant(slug, tenantLog);
  });

  cron.schedule('0 9 * * *', () => { void runDailyBackup(log); });
  log.info('backup cron iniciado (03:00 AM CR diario)');
}
