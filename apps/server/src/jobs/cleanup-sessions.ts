import cron from 'node-cron';
import { lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sessions } from '../db/schema.js';

export function startCleanupJobs(log: { info: (msg: string) => void }): void {
  // Daily at 03:00 UTC — purge sessions expired before now
  cron.schedule('0 3 * * *', async () => {
    const now = new Date().toISOString();
    const result = await db.delete(sessions).where(lt(sessions.expiresAt, now));
    log.info(`[cleanup] Expired sessions deleted: ${result.changes ?? 0}`);
  });
}
