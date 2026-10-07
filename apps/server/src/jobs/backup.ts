import cron from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { currentTenant, tenantBackupDir } from '../db/client.js';
import { controlDb } from '../db/control.js';
import { forEachActiveTenant } from './for-each-tenant.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const DATED_BACKUP_RE = /^\d{4}-\d{2}-\d{2}\.db$/;

export function latestBackupPath(slug: string): string {
  return join(tenantBackupDir(slug), 'latest.db');
}

// control.db (negocios, pagos de la mensualidad, cuentas del panel) se respalda aparte.
// "_" no es válido en un subdominio: la carpeta nunca choca con la de un negocio, y
// deploy/backup.sh la copia junto con las demás porque recorre backups/*/latest.db.
export const CONTROL_BACKUP_DIR = join(config.DATA_DIR, 'backups', '_control');

// backups/<carpeta>/YYYY-MM-DD.db + latest.db, con rotación de 30 días.
async function backupInto(
  dir: string,
  backup: (dst: string) => Promise<unknown>,
  log: FastifyBaseLogger,
): Promise<void> {
  mkdirSync(dir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const dst = join(dir, `${date}.db`);

  await backup(dst);
  copyFileSync(dst, join(dir, 'latest.db'));

  const cutoff = Date.now() - THIRTY_DAYS_MS;
  readdirSync(dir)
    .filter(f => DATED_BACKUP_RE.test(f))
    .map(f => join(dir, f))
    .filter(p => statSync(p).mtimeMs < cutoff)
    .forEach(p => { unlinkSync(p); log.info({ file: p }, 'backup rotado'); });

  log.info({ dst }, 'backup diario completado');
}

// Debe correr dentro del contexto del negocio (forEachActiveTenant).
function backupCurrentTenant(slug: string, log: FastifyBaseLogger): Promise<void> {
  return backupInto(tenantBackupDir(slug), (dst) => currentTenant().sqlite.backup(dst), log);
}

async function backupControl(log: FastifyBaseLogger): Promise<void> {
  try {
    await backupInto(CONTROL_BACKUP_DIR, (dst) => controlDb.backup(dst), log.child({ db: 'control' }));
  } catch (err) {
    log.error({ err }, 'backup de control.db falló');
  }
}

export async function runDailyBackup(log: FastifyBaseLogger): Promise<void> {
  await backupControl(log);
  await forEachActiveTenant(log, 'backup', backupCurrentTenant);
}

// 03:00 AM Costa Rica = 09:00 UTC (UTC-6 permanente, sin horario de verano)
export function startBackupCron(log: FastifyBaseLogger): void {
  // Respaldo inicial para negocios que aún no tienen uno, así la descarga funciona desde el día uno.
  if (!existsSync(join(CONTROL_BACKUP_DIR, 'latest.db'))) void backupControl(log);
  void forEachActiveTenant(log, 'backup-inicial', async (slug, tenantLog) => {
    if (!existsSync(latestBackupPath(slug))) await backupCurrentTenant(slug, tenantLog);
  });

  cron.schedule('0 9 * * *', () => { void runDailyBackup(log); });
  log.info('backup cron iniciado (03:00 AM CR diario)');
}
