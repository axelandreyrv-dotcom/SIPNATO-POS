import type { Context, ErrorHandler, MiddlewareHandler } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Superadmin } from '@dosuxsoft/shared';
import type { Actor } from '../db/client.js';
import type { Env } from '../env.js';
import { HOST_HEADER } from './constants.js';
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

// Un error que se responde fuera de Hono (el enrutador del Worker, el borde del Durable Object),
// con el mismo cuerpo y los mismos headers que la API.
export function errorResponse(err: AppError): Response {
  return Response.json(
    { error: { code: err.code, message: err.message } },
    { status: err.statusCode, headers: SECURITY_HEADERS },
  );
}

// Un cuerpo ausente o que no es JSON se trata como vacío: lo rechaza la validación con un 400.
export async function readJson(c: AppContext): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1'];

// En producción el Host es el de la URL (Cloudflare la arma con él). Solo un Worker de desarrollo
// que corre en la máquina local acepta X-Forwarded-Host, que pone el proxy de Vite: en cualquier
// otro caso permitiría elegir negocio con un header.
export function requestHost(request: Request, env: Env): string {
  const url = new URL(request.url);
  const local = LOCAL_HOSTNAMES.includes(url.hostname) || url.hostname.endsWith('.localhost');
  if (env.ENVIRONMENT === 'development' && local) {
    const forwarded = request.headers.get('X-Forwarded-Host')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }
  return url.host;
}

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

// La petición viene de otro origen según los headers que pone el navegador (sin ellos, un cliente
// que no es navegador: se acepta y lo frena la sesión).
function crossOrigin(c: AppContext): boolean {
  const site = c.req.header('Sec-Fetch-Site');
  const origin = c.req.header('Origin');
  // El host que fijó el Worker; sin él (no debería pasar) el de la URL.
  const host = c.req.header(HOST_HEADER) ?? new URL(c.req.url).host;
  return (
    (site !== undefined && site !== 'same-origin') ||
    (origin !== undefined && originHost(origin) !== host.toLowerCase())
  );
}

const originRejected = (c: AppContext) =>
  c.json({ error: { code: 'ORIGEN_NO_PERMITIDO', message: 'Origen no permitido' } }, 403);

// Para un GET con efectos (bitácora, cupo), que sameOriginWrites deja pasar.
export const sameOriginOnly: MiddlewareHandler<AppEnv> = async (c, next) =>
  crossOrigin(c) ? originRejected(c) : next();

// CSRF. Todos los subdominios de dosuxsoft.com son el mismo sitio, así que la cookie
// SameSite=Strict viaja en un POST que otro subdominio haga con `mode: 'no-cors'` o desde un
// formulario. Una escritura solo se acepta desde el mismo origen y con cuerpo JSON (un formulario
// o un no-cors no pueden mandar `application/json` sin preflight, y no hay CORS).
export const sameOriginWrites: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (SAFE_METHODS.includes(c.req.method)) return next();
  if (crossOrigin(c)) return originRejected(c);

  const length = c.req.header('Content-Length');
  const hasBody = length !== undefined ? length !== '0' : c.req.raw.body !== null;
  const type = c.req.header('Content-Type')?.toLowerCase() ?? '';
  if (hasBody && !type.startsWith('application/json')) {
    return c.json(
      {
        error: {
          code: 'TIPO_NO_SOPORTADO',
          message: 'El cuerpo de la solicitud debe ser JSON',
        },
      },
      415,
    );
  }
  return next();
};
