import cron from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import { lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sessions } from '../db/schema.js';
import { INACTIVITY_TIMEOUT_MS } from '../lib/session.js';
import { deleteExpiredPlatformSessions } from '../modules/platform/repository.js';
import { forEachActiveTenant } from './for-each-tenant.js';

export function startCleanupJobs(log: FastifyBaseLogger): void {
  // Daily at 03:00 UTC — purge sessions expired before now, en cada negocio
  cron.schedule('0 3 * * *', () => {
    void forEachActiveTenant(log, 'cleanup-sessions', (_slug, tenantLog) => {
      const now = new Date().toISOString();
      const result = db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
      tenantLog.info(`[cleanup] Expired sessions deleted: ${result.changes}`);
    });

    const inactiveBefore = new Date(Date.now() - INACTIVITY_TIMEOUT_MS).toISOString();
    log.info(`[cleanup] Sesiones del panel eliminadas: ${deleteExpiredPlatformSessions(inactiveBefore)}`);
  });
}
