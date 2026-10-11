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
import { PRE_MIGRATION_PREFIX, runMigrations } from '../db/migrator.js';
import * as schema from '../db/schema.js';
import type { Env } from '../env.js';
import { runAutoClose, scheduleAutoClose } from '../lib/auto-close.js';
import { TENANT_HEADER } from '../lib/constants.js';
import { todayCR } from '../lib/cr-time.js';
import { NegocioNoEncontrado } from '../lib/errors.js';
import { exportTenant } from '../lib/export.js';
import { errorResponse, type AppEnv } from '../lib/http.js';
import { sweepRateLimits } from '../lib/rate-limit.js';
import { deleteStaleSessions } from '../lib/session.js';
import { resetOwner } from '../modules/auth/service.js';
import { getProfile } from '../modules/business/repository.js';
import { assignBusiness } from '../modules/business/service.js';
import { createTenantApp } from '../tenant-app.js';

const SLUG_KEY = 'slug';

interface AuditMeta {
  ip: string | null;
  userAgent: string | null;
}

// Motivo del reinicio tras programar una restauración: el llamador lo reconoce en el error.
export const RESTORE_ABORT_REASON = 'Restauracion a un bookmark: reinicio del Durable Object';

export interface TenantBookmarks {
  current: string;
  preMigration: { tag: string; bookmark: string }[];
}

export interface TenantPlatformSummary {
  activated: boolean;
  template: BusinessTemplate;
  modules: ModuleKey[];
  users: number;
  lastSaleAt: string | null;
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
    // inventado, o el panel preguntando por él) no crea tablas ni alarmas.
    if (this.slug() !== undefined) {
      ctx.blockConcurrencyWhile(async () => {
        await this.ensureSchema();
        // Repone la alarma del cierre automático si se perdió, o corre ya una vencida. Un fallo
        // aquí no debe dejar al negocio sin servicio (un error en blockConcurrencyWhile reinicia
        // el DO): se registra y la próxima activación vuelve a intentarlo.
        try {
          await this.scheduleAutoClose();
        } catch (err) {
          console.error('No se pudo programar el cierre automático', err);
        }
      });
    }
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
    await this.scheduleAutoClose();
  }

  // Programa (o borra) la alarma del cierre automático según la configuración del negocio.
  async scheduleAutoClose(): Promise<void> {
    const slug = this.slug();
    if (slug === undefined) return;
    await this.inContext(slug, () => scheduleAutoClose(this.ctx.storage));
  }

  // Lo llama el cron diario (03:00 CR): limpieza y respaldo JSON del negocio en R2.
  async dailyMaintenance(): Promise<void> {
    const slug = this.requireSlug();
    const backup = this.inContext(slug, () => {
      deleteStaleSessions();
      return exportTenant(this.ctx.storage);
    });
    sweepRateLimits(this.ctx.storage.kv);
    await this.env.BACKUPS.put(`tenants/${slug}/${todayCR()}.json`, JSON.stringify(backup), {
      httpMetadata: { contentType: 'application/json' },
    });
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

  // ─── Recuperación a un punto en el tiempo (consola de operaciones) ───

  // Los bookmarks guardados antes de cada migración y el del momento actual.
  async bookmarks(): Promise<TenantBookmarks> {
    this.requireSlug();
    const preMigration = [
      ...this.ctx.storage.kv.list<string>({ prefix: PRE_MIGRATION_PREFIX }),
    ].map(([key, bookmark]) => ({ tag: key.slice(PRE_MIGRATION_PREFIX.length), bookmark }));
    return { current: await this.ctx.storage.getCurrentBookmark(), preMigration };
  }

  // Deja la BD (tablas y kv) como estaba en `bookmark` y reinicia el DO para que la restauración
  // ocurra ya. Si funciona no devuelve nada: el llamador recibe el error del reinicio, con
  // RESTORE_ABORT_REASON en el mensaje. Si no se pudo programar (bookmark inválido, fuera de los
  // 30 días, o un runtime sin PITR como el local) lo devuelve sin lanzar y el DO sigue igual.
  async restoreToBookmark(bookmark: string): Promise<{ scheduled: false; reason: string }> {
    if (this.slug() === undefined) {
      return { scheduled: false, reason: 'Este negocio no está inicializado' };
    }
    try {
      await this.ctx.storage.onNextSessionRestoreBookmark(bookmark);
    } catch (err) {
      return { scheduled: false, reason: err instanceof Error ? err.message : String(err) };
    }
    this.ctx.abort(RESTORE_ABORT_REASON);
    throw new Error(RESTORE_ABORT_REASON);
  }

  // Cierre automático de caja (CLAUDE.md §7: el corte agrupa por caja, no por fecha).
  override async alarm(): Promise<void> {
    const slug = this.slug();
    if (slug === undefined) return;
    await this.inContext(slug, () => runAutoClose(this.ctx.storage));
  }

  override async fetch(request: Request): Promise<Response> {
    const slug = this.slug();
    if (slug === undefined || request.headers.get(TENANT_HEADER) !== slug) {
      return errorResponse(new NegocioNoEncontrado());
    }
    return this.inContext(slug, () => this.app.fetch(request, this.env));
  }
}
