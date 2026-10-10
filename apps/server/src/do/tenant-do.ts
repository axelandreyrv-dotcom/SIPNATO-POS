import { DurableObject } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/durable-sqlite';
import type { Hono } from 'hono';
import { applyAssignment, type AssignBusinessInput } from '@sipnato/shared';
import { bootstrapTenant } from '../db/bootstrap.js';
import { runInTenant, type TenantDb } from '../db/client.js';
import { MIGRATIONS } from '../db/migrations.js';
import { runMigrations } from '../db/migrator.js';
import * as schema from '../db/schema.js';
import type { Env } from '../env.js';
import { TENANT_HEADER } from '../lib/constants.js';
import { NegocioNoEncontrado } from '../lib/errors.js';
import type { AppEnv } from '../lib/http.js';
import { getProfile } from '../modules/business/repository.js';
import { assignBusiness } from '../modules/business/service.js';
import { createTenantApp } from '../tenant-app.js';

const SLUG_KEY = 'slug';

function negocioNoEncontrado(): Response {
  const err = new NegocioNoEncontrado();
  return Response.json(
    { error: { code: err.code, message: err.message } },
    { status: err.statusCode, headers: { 'Cache-Control': 'no-store' } },
  );
}

export class TenantDO extends DurableObject<Env> {
  readonly db: TenantDb;
  private readonly app: Hono<AppEnv>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { schema });
    this.app = createTenantApp(ctx.storage.kv);
    // Ninguna petición entra hasta que el esquema está al día: dos primeras peticiones
    // simultáneas no pueden migrar a la vez.
    ctx.blockConcurrencyWhile(async () => {
      await runMigrations(ctx.storage, MIGRATIONS);
      bootstrapTenant(this.db);
    });
  }

  // La plataforma lo llama al crear el negocio. Repetirlo con la misma asignación no cambia nada;
  // un DO ya inicializado nunca pasa a ser de otro negocio.
  initialize(slug: string, assignment: AssignBusinessInput): void {
    const kv = this.ctx.storage.kv;
    const current = kv.get<string>(SLUG_KEY);
    if (current !== undefined && current !== slug) {
      throw new Error(`Este Durable Object ya pertenece al negocio "${current}"`);
    }
    runInTenant({ slug, db: this.db, actor: null, env: this.env }, () => {
      const profile = getProfile();
      if (JSON.stringify(applyAssignment(profile, assignment)) !== JSON.stringify(profile)) {
        assignBusiness(assignment, { ip: null, userAgent: null });
      }
    });
    kv.put(SLUG_KEY, slug);
  }

  override async fetch(request: Request): Promise<Response> {
    const slug = this.ctx.storage.kv.get<string>(SLUG_KEY);
    if (slug === undefined || request.headers.get(TENANT_HEADER) !== slug) {
      return negocioNoEncontrado();
    }
    return runInTenant({ slug, db: this.db, actor: null, env: this.env }, () =>
      this.app.fetch(request, this.env),
    );
  }
}
