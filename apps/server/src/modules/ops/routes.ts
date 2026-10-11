import { Hono } from 'hono';
import { AppError } from '../../lib/errors.js';
import { clientIp, readJson, requestMeta, type AppEnv } from '../../lib/http.js';
import { hit, peekLimit, tooManyAttempts } from '../../lib/rate-limit.js';
import { insertPlatformAudit } from '../platform/repository.js';
import {
  auditActionFor,
  OPS_COMMANDS,
  opsEnabled,
  opsRequestSchema,
  runOpsCommand,
  tokenMatches,
  type OpsCommand,
} from './service.js';

const FIFTEEN_MINUTES = 15 * 60_000;
const MAX_AUTH_FAILURES = 10;

const isCommand = (value: unknown): value is OpsCommand =>
  (OPS_COMMANDS as readonly unknown[]).includes(value);

// POST /internal/ops — solo existe en admin.<dominio> (el Worker no la enruta desde un negocio).
const opsRoutes = new Hono<AppEnv>();

opsRoutes.post(
  '/',
  // Sin OPS_TOKEN la ruta no existe: misma respuesta que cualquier ruta desconocida.
  async (c, next) => (opsEnabled(c.env.OPS_TOKEN) ? next() : c.notFound()),
  async (c) => {
    const meta = requestMeta(c);
    // Solo cuentan los tokens que faltan o no coinciden: la consola puede usarse sin límite, y
    // quien intenta adivinar queda frenado (también si después prueba con el token correcto).
    const limitKey = `ops:${clientIp(c)}`;
    const limit = peekLimit(c.var.kv, limitKey, MAX_AUTH_FAILURES, FIFTEEN_MINUTES);
    if (!limit.allowed) return tooManyAttempts(c, limit.retryAfterSec);

    const audit = (action: string, payload: Record<string, unknown>, tenantSlug?: string) =>
      insertPlatformAudit({
        action,
        tenantSlug: tenantSlug ?? null,
        payload,
        superadminId: null,
        meta,
      });

    const header = c.req.header('Authorization') ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    // La respuesta no dice si faltó o si no coincide; la bitácora sí (nunca el token).
    if (!(await tokenMatches(presented, c.env.OPS_TOKEN!)) || presented === '') {
      hit(c.var.kv, limitKey, MAX_AUTH_FAILURES, FIFTEEN_MINUTES);
      audit('OPS_AUTH_FAILED', { reason: presented === '' ? 'sin-token' : 'token-incorrecto' });
      throw new AppError('NO_AUTORIZADO', 'No autorizado', 401);
    }

    const body = await readJson(c);
    const parsed = opsRequestSchema.safeParse(body);
    if (!parsed.success) {
      const command = (body as { command?: unknown } | undefined)?.command;
      audit(isCommand(command) ? auditActionFor(command) : 'OPS_INVALID_REQUEST', {
        ok: false,
        error: 'VALIDATION_ERROR',
      });
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Datos inválidos',
        400,
      );
    }

    // Los argumentos (usuario, subdominio, nombre, bookmark) no son secretos; el resultado sí
    // puede serlo (contraseñas temporales, códigos) y nunca va a la bitácora.
    const { command, args } = parsed.data;
    const action = auditActionFor(command);
    const tenantSlug = 'slug' in args ? args.slug : undefined;
    try {
      const outcome = await runOpsCommand(parsed.data, meta);
      audit(action, { ok: true, ...args, ...outcome.audit }, tenantSlug);
      return c.json(outcome.result);
    } catch (err) {
      audit(
        action,
        { ok: false, ...args, error: err instanceof AppError ? err.code : 'ERROR_INTERNO' },
        tenantSlug,
      );
      throw err;
    }
  },
);

export default opsRoutes;
