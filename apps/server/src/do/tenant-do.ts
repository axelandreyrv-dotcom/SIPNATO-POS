import { DurableObject } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/durable-sqlite';
import { bootstrapTenant } from '../db/bootstrap.js';
import type { TenantDb } from '../db/client.js';
import { MIGRATIONS } from '../db/migrations.js';
import { runMigrations } from '../db/migrator.js';
import * as schema from '../db/schema.js';
import type { Env } from '../env.js';

export class TenantDO extends DurableObject<Env> {
  readonly db: TenantDb;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { schema });
    // Ninguna petición entra hasta que el esquema está al día: dos primeras peticiones
    // simultáneas no pueden migrar a la vez.
    ctx.blockConcurrencyWhile(async () => {
      await runMigrations(ctx.storage, MIGRATIONS);
      bootstrapTenant(this.db);
    });
  }

  override async fetch(_request: Request): Promise<Response> {
    return new Response('No implementado', { status: 501 });
  }
}
