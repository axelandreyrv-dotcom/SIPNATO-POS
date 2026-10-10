import { AsyncLocalStorage } from 'node:async_hooks';
import type { DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';
import type { Env } from '../env.js';
import type * as schema from './schema.js';

export type TenantDb = DrizzleSqliteDODatabase<typeof schema>;

export type UserRole = (typeof schema.USER_ROLES)[number];

export interface Actor {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
}

// Un objeto nuevo por request/tarea: `actor` se fija después de validar la sesión y no puede
// compartirse entre peticiones al mismo negocio.
export interface RequestContext {
  slug: string;
  db: TenantDb;
  actor: Actor | null;
  env: Env;
}

const tenantStorage = new AsyncLocalStorage<RequestContext>();

export function runInTenant<T>(ctx: RequestContext, fn: () => T): T {
  return tenantStorage.run(ctx, fn);
}

// Falla cerrado: cualquier acceso a datos fuera de un negocio identificado lanza,
// en vez de caer silenciosamente en una BD por defecto.
export function currentTenant(): RequestContext {
  const ctx = tenantStorage.getStore();
  if (!ctx) throw new Error('db usado fuera de un negocio');
  return ctx;
}

// Lo fija requireAuth tras validar la sesión.
export function setActor(actor: Actor): void {
  currentTenant().actor = actor;
}

// Autor que se registra en audit_log. null = sistema (cron, scripts) o request sin sesión.
export function currentActorId(): number | null {
  return tenantStorage.getStore()?.actor?.id ?? null;
}

export function currentEnv(): Env {
  return currentTenant().env;
}

// `db` es un proxy hacia la BD del negocio del request/tarea actual. Los repositories
// importan `db` igual que siempre; el aislamiento lo garantiza el contexto.
export const db = new Proxy({} as TenantDb, {
  get(_target, prop) {
    const real = currentTenant().db;
    const value = Reflect.get(real, prop, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
