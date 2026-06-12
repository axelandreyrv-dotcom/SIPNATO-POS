import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLog, printJobs } from '../../db/schema.js';
import type { PrintPayload } from '@sipnato/shared';

export function insertPrintJob(
  type: 'sale' | 'boleta' | 'quote' | 'test',
  payload: PrintPayload,
): number {
  const result = db
    .insert(printJobs)
    .values({ type, payload: JSON.stringify(payload), status: 'pending', attempts: 0 })
    .returning({ id: printJobs.id })
    .get()!;
  return result.id;
}

export function getPendingJobs(): Array<{ id: number; type: string; payload: string }> {
  return db
    .select({ id: printJobs.id, type: printJobs.type, payload: printJobs.payload })
    .from(printJobs)
    .where(eq(printJobs.status, 'pending'))
    .orderBy(printJobs.id)
    .all();
}

export function ackJob(
  jobId: number,
  meta: { ip: string | null; userAgent: string | null },
): void {
  const now = new Date().toISOString();
  db.transaction((tx) => {
    const job = tx
      .select()
      .from(printJobs)
      .where(and(eq(printJobs.id, jobId), eq(printJobs.status, 'pending')))
      .limit(1)
      .get();
    if (!job) return;

    tx
      .update(printJobs)
      .set({ status: 'printed', updatedAt: now })
      .where(eq(printJobs.id, jobId))
      .run();

    tx.insert(auditLog).values({
      action: 'PRINT_JOB_PRINTED',
      entityType: 'print_jobs',
      entityId: String(jobId),
      payloadSnapshot: job.payload,
      ip: meta.ip,
      userAgent: meta.userAgent,
    }).run();
  });
}

export function failJob(jobId: number): void {
  const now = new Date().toISOString();
  const job = db
    .select({ attempts: printJobs.attempts })
    .from(printJobs)
    .where(eq(printJobs.id, jobId))
    .limit(1)
    .get();
  if (!job) return;

  const newAttempts = job.attempts + 1;
  const newStatus = newAttempts >= 3 ? 'failed' : 'pending';
  db.update(printJobs)
    .set({ attempts: newAttempts, status: newStatus, updatedAt: now })
    .where(eq(printJobs.id, jobId))
    .run();
}
