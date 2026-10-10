import { DurableObject } from 'cloudflare:workers';
import { count, desc, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/durable-sqlite';
import type { Hono } from 'hono';
import {
  applyAssignment,
  type AssignBusinessInput,
  type BusinessProfile,
  type BusinessTemplate,
  type ModuleKey,
} from '@sipnato/shared';
import { bootstrapTenant } from '../db/bootstrap.js';
import { runInTenant, type TenantDb } from '../db/client.js';
import { MIGRATIONS } from '../db/migrations.js';
import { runMigrations } from '../db/migrator.js';
import * as schema from '../db/schema.js';
import type { Env } from '../env.js';
import { TENANT_HEADER } from '../lib/constants.js';
import { NegocioNoEncontrado } from '../lib/errors.js';
import type { AppEnv } from '../lib/http.js';
import { resetOwner } from '../modules/auth/service.js';
import { getProfile } from '../modules/business/repository.js';
import { assignBusiness } from '../modules/business/service.js';
import { createTenantApp } from '../tenant-app.js';

const SLUG_KEY = 'slug';

interface AuditMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface TenantPlatformSummary {
  activated: boolean;
  template: BusinessTemplate;
  modules: ModuleKey[];
  users: number;
  lastSaleAt: string | null;
}

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
  private schemaReady = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { schema });
    this.app = createTenantApp(ctx.storage);
    // Solo un negocio ya inicializado tiene esquema. Un DO que nadie inicializó (un subdominio
    // inventado, o el panel preguntando por él) no crea tablas.
    if (this.slug() !== undefined) ctx.blockConcurrencyWhile(() => this.ensureSchema());
  }

  private slug(): string | undefined {
    return this.ctx.storage.kv.get<string>(SLUG_KEY);
  }

  // Ninguna petición entra mientras se migra: dos primeras llamadas simultáneas no migran a la vez.
  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    await runMigrations(this.ctx.storage, MIGRATIONS);
    bootstrapTenant(this.db);
    this.schemaReady = true;
  }

  private inContext<T>(slug: string, fn: () => T): T {
    return runInTenant({ slug, db: this.db, actor: null, env: this.env }, fn);
  }

  private requireSlug(): string {
    const slug = this.slug();
    if (slug === undefined) throw new Error('Este negocio no está inicializado');
    return slug;
  }

  // ─── RPC (la llama la plataforma) ───
  // Un error lanzado aquí cruza el RPC solo con su mensaje: un AppError pierde code y status, así
  // que el llamador nunca debe depender de ellos.

  // La plataforma lo llama al crear el negocio. Repetirlo con la misma asignación no cambia nada;
  // un DO ya inicializado nunca pasa a ser de otro negocio.
  async initialize(slug: string, assignment: AssignBusinessInput): Promise<void> {
    const current = this.slug();
    if (current !== undefined && current !== slug) {
      throw new Error(`Este Durable Object ya pertenece al negocio "${current}"`);
    }
    await this.ctx.blockConcurrencyWhile(() => this.ensureSchema());
    this.inContext(slug, () => {
      const profile = getProfile();
      if (JSON.stringify(applyAssignment(profile, assignment)) !== JSON.stringify(profile)) {
        assignBusiness(assignment, { ip: null, userAgent: null });
      }
    });
    this.ctx.storage.kv.put(SLUG_KEY, slug);
  }

  // Lo que el panel muestra del negocio. null si nunca se inicializó (sin tocar el esquema).
  platformSummary(): TenantPlatformSummary | null {
    const slug = this.slug();
    if (slug === undefined) return null;
    return this.inContext(slug, () => {
      const { template, modules } = getProfile();
      const users = this.db.select({ n: count() }).from(schema.users).get()?.n ?? 0;
      const lastSale = this.db
        .select({ createdAt: schema.sales.createdAt })
        .from(schema.sales)
        .where(isNull(schema.sales.deletedAt))
        .orderBy(desc(schema.sales.id))
        .limit(1)
        .get();
      return {
        activated: users > 0,
        template,
        modules,
        users,
        lastSaleAt: lastSale?.createdAt ?? null,
      };
    });
  }

  // Tipo de negocio y módulos: solo los asigna la plataforma.
  assignBusiness(
    input: AssignBusinessInput,
    meta: AuditMeta,
  ): { before: BusinessProfile; after: BusinessProfile } {
    return this.inContext(this.requireSlug(), () => assignBusiness(input, meta));
  }

  // Recuperación de emergencia del dueño (reemplaza al script reset-admin).
  async resetOwner(): Promise<{ username: string; tempPassword: string; recoveryCode: string }> {
    const slug = this.requireSlug();
    return this.inContext(slug, () => resetOwner());
  }

  override async fetch(request: Request): Promise<Response> {
    const slug = this.slug();
    if (slug === undefined || request.headers.get(TENANT_HEADER) !== slug) {
      return negocioNoEncontrado();
    }
    return this.inContext(slug, () => this.app.fetch(request, this.env));
  }
}
