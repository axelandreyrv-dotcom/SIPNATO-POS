import type { Context, ErrorHandler, MiddlewareHandler } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ZodType, ZodTypeDef } from 'zod';
import type { Superadmin } from '@sipnato/shared';
import type { Actor } from '../db/client.js';
import type { Env } from '../env.js';
import { AppError } from './errors.js';

export type AppEnv = {
  Bindings: Env;
  Variables: {
    // Almacén del rate limit (kv del Durable Object que atiende la petición).
    kv: DurableObjectStorage['kv'];
    // Storage completo del Durable Object (el respaldo vuelca sus tablas).
    storage: DurableObjectStorage;
    user: Actor;
    // En el panel: el superadministrador de la sesión (requirePlatformAuth).
    superadmin: Superadmin;
    sessionId: string;
  };
};

export type AppContext = Context<AppEnv>;

// Cloudflare pone `CF-Connecting-IP` en toda petición real y sobrescribe el que mande el cliente.
// Sin él (solo en desarrollo o tests) se usa localhost; en producción todas las peticiones sin IP
// comparten un mismo contador, para que su ausencia no sirva para esquivar el rate limit.
export function clientIp(c: AppContext): string {
  const ip = c.req.header('CF-Connecting-IP');
  if (ip) return ip;
  return c.env.ENVIRONMENT === 'production' ? 'sin-ip' : '127.0.0.1';
}

export function requestMeta(c: AppContext): { ip: string; userAgent: string | null } {
  return { ip: clientIp(c), userAgent: c.req.header('user-agent') ?? null };
}

// Para los services que esperan `userAgent` ausente (no null) cuando no viene.
export function requestMetaCompact(c: AppContext): { ip: string; userAgent?: string } {
  const userAgent = c.req.header('user-agent');
  return { ip: clientIp(c), ...(userAgent !== undefined && { userAgent }) };
}

// Sin `Domain`: la cookie queda atada al subdominio del negocio (CLAUDE.md §6.1).
function cookieOptions(c: AppContext) {
  return {
    httpOnly: true,
    secure: c.env.ENVIRONMENT !== 'development',
    sameSite: 'Strict' as const,
    path: '/',
  };
}

export function setSessionCookie(
  c: AppContext,
  name: string,
  token: string,
  maxAgeSec: number,
): void {
  setCookie(c, name, token, { ...cookieOptions(c), maxAge: maxAgeSec });
}

export function clearSessionCookie(c: AppContext, name: string): void {
  deleteCookie(c, name, cookieOptions(c));
}

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof AppError) {
    return c.json(
      { error: { code: err.code, message: err.message } },
      err.statusCode as ContentfulStatusCode,
    );
  }
  // Cualquier otro error (también un ZodError de datos ya guardados, como un perfil corrupto) es
  // interno. Nunca detalles al cliente (CWE-209): quedan solo en el log del Worker.
  console.error('Error no controlado', err);
  return c.json({ error: { code: 'ERROR_INTERNO', message: 'Error interno del servidor' } }, 500);
};

// Los headers de §6.6 que vivían en Caddy, menos la CSP (la pone la respuesta de los assets).
const SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export const apiHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) c.res.headers.set(name, value);
};

// Un cuerpo ausente o que no es JSON se trata como vacío: lo rechaza la validación con un 400.
export async function readJson(c: AppContext): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

// Solo aquí un ZodError es culpa del cliente: el cuerpo de la petición no es válido.
export async function parseBody<T>(
  c: AppContext,
  schema: ZodType<T, ZodTypeDef, unknown>,
): Promise<T> {
  const result = schema.safeParse(await readJson(c));
  if (!result.success) {
    throw new AppError('VALIDACION', result.error.issues[0]?.message ?? 'Datos inválidos', 400);
  }
  return result.data;
}
