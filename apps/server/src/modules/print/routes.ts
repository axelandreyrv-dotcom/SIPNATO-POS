import type { FastifyInstance } from 'fastify';
import argon2 from 'argon2';
import { createPrintJobSchema } from '@sipnato/shared';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { getPrintBridgeTokenHash } from '../settings/repository.js';
import {
  registerBridgeSocket,
  clearBridgeSocket,
  getBridgeStatus,
  createPrintJob,
  handleBridgeAck,
  handleBridgeFail,
  recordAuthFailure,
  isIpBlacklisted,
  setTokenSetFlag,
} from './service.js';

export default async function printRoutes(app: FastifyInstance) {
  // Initialise after migrations have run (plugin is called during app.listen).
  setTokenSetFlag(getPrintBridgeTokenHash() !== null);
  // ── WebSocket /ws/print ────────────────────────────────────────────────────
  // The bridge connects here with Authorization: Bearer <token>
  app.get('/print', { websocket: true }, async (socket, request) => {
    const clientIp = request.ip ?? 'unknown';

    if (isIpBlacklisted(clientIp)) {
      socket.close(1008, 'Blacklisted');
      return;
    }

    // Verify token
    const authHeader = request.headers['authorization'] ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const hash = getPrintBridgeTokenHash();

    if (!hash || !token) {
      recordAuthFailure(clientIp);
      socket.close(1008, 'Unauthorized');
      return;
    }

    try {
      const valid = await argon2.verify(hash, token);
      if (!valid) {
        const blacklisted = recordAuthFailure(clientIp);
        socket.close(1008, blacklisted ? 'Blacklisted' : 'Unauthorized');
        return;
      }
    } catch {
      recordAuthFailure(clientIp);
      socket.close(1011, 'Server error');
      return;
    }

    registerBridgeSocket(socket);
    app.log.info(`[print-bridge] connected from ${clientIp}`);

    socket.on('message', (raw) => {
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
        typeof (msg as Record<string, unknown>).type !== 'string'
      ) {
        return;
      }

      const m = msg as Record<string, unknown>;

      if (m.type === 'ack' && typeof m.jobId === 'number') {
        handleBridgeAck(m.jobId, { ip: clientIp, userAgent: null });
      } else if (m.type === 'fail' && typeof m.jobId === 'number') {
        handleBridgeFail(m.jobId);
      } else if (m.type === 'pong') {
        // heartbeat
      }
    });

    socket.on('close', () => {
      clearBridgeSocket(socket);
      app.log.info(`[print-bridge] disconnected from ${clientIp}`);
    });

    socket.on('error', (err) => {
      clearBridgeSocket(socket);
      app.log.warn({ err }, '[print-bridge] socket error');
    });
  });

  // ── GET /ws/print/status ─────────────────────────────────────────────────
  app.get('/print/status', { preHandler: [requireAuth] }, async () => {
    return getBridgeStatus();
  });

  // ── POST /ws/print/jobs ──────────────────────────────────────────────────
  app.post('/print/jobs', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = createPrintJobSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Payload inválido' } });
    }
    try {
      const result = createPrintJob(body.data.payload);
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }
  });

  // ── POST /ws/print/test ───────────────────────────────────────────────────
  app.post('/print/test', { preHandler: [requireAuth] }, async (request, reply) => {
    const result = createPrintJob({
      type: 'test',
      message: 'SIPNATO POS — impresora conectada OK',
      timestamp: new Date().toISOString(),
    });
    return reply.status(201).send(result);
  });
}

