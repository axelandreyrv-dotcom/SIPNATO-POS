import WebSocket from 'ws';
import { printPayloadSchema } from '@sipnato/shared';
import { bridgeConfig } from './config.js';
import { printJob } from './printer.js';

const INITIAL_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const BACKOFF_FACTOR = 2;
const PING_INTERVAL_MS = 30_000;

export function startBridge(): void {
  let delay = INITIAL_DELAY_MS;

  function connect(): void {
    if (!bridgeConfig.bridgeToken) {
      console.error('[bridge] BRIDGE_TOKEN is not set — exiting');
      process.exit(1);
    }

    console.log(`[bridge] connecting to ${bridgeConfig.serverUrl}`);

    const ws = new WebSocket(bridgeConfig.serverUrl, {
      headers: { Authorization: `Bearer ${bridgeConfig.bridgeToken}` },
    });

    let pingTimer: ReturnType<typeof setInterval> | null = null;

    ws.on('open', () => {
      console.log('[bridge] connected');
      delay = INITIAL_DELAY_MS;

      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL_MS);
    });

    ws.on('message', (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (
        typeof msg !== 'object' ||
        msg === null ||
        !('type' in msg) ||
        (msg as Record<string, unknown>).type !== 'job'
      ) {
        return;
      }

      const m = msg as Record<string, unknown>;
      const jobId = typeof m.id === 'number' ? m.id : null;
      if (jobId === null) return;

      const parsed = printPayloadSchema.safeParse(m.payload);
      if (!parsed.success) {
        console.warn(`[bridge] invalid payload for job ${jobId}:`, parsed.error.issues);
        ws.send(JSON.stringify({ type: 'fail', jobId, error: 'invalid payload' }));
        return;
      }

      try {
        printJob(parsed.data);
        ws.send(JSON.stringify({ type: 'ack', jobId }));
        console.log(`[bridge] job ${jobId} (${parsed.data.type}) printed`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[bridge] job ${jobId} failed:`, message);
        ws.send(JSON.stringify({ type: 'fail', jobId, error: message }));
      }
    });

    ws.on('close', (code, reason) => {
      if (pingTimer) clearInterval(pingTimer);
      console.log(`[bridge] disconnected (code=${code} reason=${reason}) — reconnecting in ${delay}ms`);
      setTimeout(connect, delay);
      delay = Math.min(delay * BACKOFF_FACTOR, MAX_DELAY_MS);
    });

    ws.on('error', (err) => {
      console.error('[bridge] socket error:', err.message);
      // 'close' fires after 'error', so reconnect is handled there.
    });
  }

  connect();
}
