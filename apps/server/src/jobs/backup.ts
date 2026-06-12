import cron from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { sqlite } from '../db/client.js';
import { config } from '../config.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function runDailyBackup(log: FastifyBaseLogger): Promise<void> {
  const dir = config.BACKUP_PATH;
  mkdirSync(dir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const dst = join(dir, `dosuxsoft-${date}.db`);
  const latest = join(dir, 'dosuxsoft-latest.db');

  try {
    await sqlite.backup(dst);
    copyFileSync(dst, latest);

    // Rotar: eliminar backups con más de 30 días
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    readdirSync(dir)
      .filter(f => /^dosuxsoft-\d{4}-\d{2}-\d{2}\.db$/.test(f))
      .map(f => join(dir, f))
      .filter(p => statSync(p).mtimeMs < cutoff)
      .forEach(p => { unlinkSync(p); log.info({ file: p }, 'backup rotado'); });

    log.info({ dst }, 'backup diario completado');
  } catch (err) {
    log.error({ err }, 'error en backup diario');
  }
}

// 03:00 AM Costa Rica = 09:00 UTC (UTC-6 permanente, sin horario de verano)
export function startBackupCron(log: FastifyBaseLogger): void {
  // Generate an initial backup on startup so the download endpoint works from day one.
  const latest = join(config.BACKUP_PATH, 'dosuxsoft-latest.db');
  if (!existsSync(latest)) {
    void runDailyBackup(log);
  }

  cron.schedule('0 9 * * *', () => { void runDailyBackup(log); });
  log.info('backup cron iniciado (03:00 AM CR diario)');
}
