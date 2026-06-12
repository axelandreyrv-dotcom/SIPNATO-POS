import type { WebSocket } from 'ws';
import type { PrintPayload, PrintBridgeStatus } from '@sipnato/shared';
import { getPendingJobs, insertPrintJob, ackJob, failJob } from './repository.js';

// In-memory bridge connection — one connection at a time.
let activeSocket: WebSocket | null = null;

// IP → { count, resetAt }
const authFailures = new Map<string, { count: number; resetAt: number }>();

export function registerBridgeSocket(socket: WebSocket): void {
  activeSocket = socket;
  // Flush all pending jobs as soon as the bridge connects.
  const pending = getPendingJobs();
  for (const job of pending) {
    sendJob(socket, job.id, job.type, job.payload);
  }
}

export function clearBridgeSocket(socket: WebSocket): void {
  if (activeSocket === socket) activeSocket = null;
}

export function getBridgeStatus(): PrintBridgeStatus {
  const tokenSet = getTokenSet();
  return { connected: activeSocket !== null, tokenSet };
}

// Set by settings module at startup + token rotation
let tokenSetFlag = false;
export function setTokenSetFlag(isSet: boolean): void {
  tokenSetFlag = isSet;
}
function getTokenSet(): boolean {
  return tokenSetFlag;
}

export function createPrintJob(
  payload: PrintPayload,
): { id: number; dispatched: boolean } {
  const id = insertPrintJob(payload.type, payload);
  let dispatched = false;
  if (activeSocket !== null) {
    sendJob(activeSocket, id, payload.type, JSON.stringify(payload));
    dispatched = true;
  }
  return { id, dispatched };
}

export function handleBridgeAck(
  jobId: number,
  meta: { ip: string | null; userAgent: string | null },
): void {
  ackJob(jobId, meta);
}

export function handleBridgeFail(jobId: number): void {
  failJob(jobId);
}

// ── Auth failure tracking ──────────────────────────────────────────────────────

const WINDOW_MS = 60_000;
const MAX_FAILURES = 3;

export function recordAuthFailure(ip: string): boolean {
  const now = Date.now();
  const entry = authFailures.get(ip);
  if (!entry || entry.resetAt < now) {
    authFailures.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (entry.count > MAX_FAILURES) return true;
  return false;
}

export function isIpBlacklisted(ip: string): boolean {
  const now = Date.now();
  const entry = authFailures.get(ip);
  if (!entry || entry.resetAt < now) return false;
  return entry.count > MAX_FAILURES;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function sendJob(
  socket: WebSocket,
  id: number,
  type: string,
  payloadRaw: string,
): void {
  try {
    socket.send(
      JSON.stringify({ type: 'job', id, jobType: type, payload: JSON.parse(payloadRaw) }),
    );
  } catch {
    // Socket closed between checks — will be resent on next connect.
  }
}
