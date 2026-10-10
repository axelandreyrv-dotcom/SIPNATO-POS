# Fase G — Cloudflare Workers: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correr Dosuxsoft POS completo en Cloudflare Workers Paid (`*.dosuxsoft.com`), con un Durable Object SQLite por negocio y otro para la plataforma, sin VPS.

**Architecture:** El Worker `dosuxsoft` sirve la SPA como Static Assets y reenvía `/api`, `/auth`, `/platform`, `/internal` y `/health` al Durable Object que corresponde al `Host`. Dentro de cada DO corre una app Hono con los mismos services y repositories de hoy; `db` sigue siendo un proxy sobre `AsyncLocalStorage`. Lo que hoy vive en `control.db` pasa a `PlatformDO`, y los negocios lo consultan por RPC.

**Tech Stack:** Cloudflare Workers + Durable Objects (SQLite) + R2 + Cron Triggers, Hono 4, drizzle-orm 0.44 (`durable-sqlite`), `argon2id` (WebAssembly precompilado), wrangler 4, vitest + `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/superpowers/specs/2026-10-10-fase-g-cloudflare-design.md` (decisiones D1–D15). Prueba de concepto de referencia: `cf-poc/src/index.ts` y `cf-poc/src/argon.ts` en el scratchpad de la sesión; el patrón se copia en las Tareas 2 y 3.

## Global Constraints

- Cuenta Cloudflare `axelandreyrv@gmail.com`. **Nunca** modificar `seitcr.com`, el Worker `seitcr`, ni los registros `dosuxsoft.com` / `www` / correo de la zona `dosuxsoft.com`.
- Worker `dosuxsoft`, `compatibility_date: "2026-10-01"`, `compatibility_flags: ["nodejs_compat"]`, `workers_dev: false`, `preview_urls: false`.
- argon2id `m=19456, t=2, p=1`, salt 16 bytes, hash 32 bytes, formato PHC `$argon2id$v=19$m=…,t=…,p=…$salt$hash` (base64 sin `=`).
- Las migraciones `apps/server/src/db/migrations/0000`–`0010` y `meta/_journal.json` no se modifican.
- Las reglas de `CLAUDE.md` §6 y §7 siguen vigentes (sesión 8 h / 60 min, cookie `HttpOnly; Secure; SameSite=Strict` sin `Domain`, errores `{ error: { code, message } }` sin detalles internos, `Cache-Control: no-store` en la API, `audit_log` con `userId: currentActorId()`, montos enteros, fechas UTC con `toISOString()`).
- Límites de intentos (§6.4): login 5/15 min, recover 3/30 min, descarga de respaldo 5/h, global 200/min; clave = negocio + IP (`CF-Connecting-IP`).
- `Secure` en la cookie se omite **solo** con `ENVIRONMENT=development`.
- Hora de CR = UTC−6 sin horario de verano (`lib/cr-time.ts`).
- Secretos solo con `wrangler secret put` o `apps/server/.dev.vars` (gitignored). El token del BCCR nunca entra al repositorio.
- Cada commit pasa `pnpm lint`, `pnpm format:check`, `pnpm --filter @sipnato/server test` y `tsc --noEmit` en los tres workspaces.

## Review Focus

1. **`X-Forwarded-Host` o `Host` falsificado en producción**: con `ENVIRONMENT=production` el Worker ignora `X-Forwarded-Host`; un `Host` fuera de `*.TENANT_BASE_DOMAIN`, con puerto raro o con un slug inválido devuelve 404 JSON y nunca crea un DO (test en Tarea 6).
2. **Negocio que existe en `PlatformDO` pero cuyo DO nunca se inicializó, o un slug que no existe**: el Worker no instancia `TenantDO` para slugs desconocidos (cada `idFromName` nuevo crea almacenamiento facturable); el listado del panel muestra el negocio como "Sin activar" en vez de fallar (tests en Tareas 5 y 6).
3. **Dos peticiones simultáneas al primer arranque de un DO**: las migraciones corren una sola vez dentro de `blockConcurrencyWhile`; la segunda petición espera y ve las tablas (test en Tarea 2).
4. **Rutas de la SPA contra rutas de la API**: `GET /caja` en un negocio devuelve `index.html`; `GET /api/no-existe` devuelve 404 JSON, nunca HTML; `GET /platform/x` desde un negocio da 404 (tests en Tarea 6).
5. **Hash viejo o parámetros distintos**: un usuario con hash `m=65536,t=3,p=4` inicia sesión y su hash queda en `m=19456,t=2,p=1`; una contraseña incorrecta no cambia nada (test en Tarea 2).

---

## Estructura de archivos

```
apps/server/
  wrangler.jsonc                 NUEVO   configuración del Worker (prod) + env "dev"
  vitest.config.ts               NUEVO   pool de workers
  .dev.vars.example              NUEVO   OPS_TOKEN y BCCR_API_TOKEN de ejemplo (sin valores reales)
  src/worker.ts                  NUEVO   entrada: fetch (enrutador por Host) + scheduled (crons)
  src/env.ts                     NUEVO   interfaz Env + lectura de vars
  src/do/tenant-do.ts            NUEVO   TenantDO: migraciones, app Hono, RPC, alarma
  src/do/platform-do.ts          NUEVO   PlatformDO: tablas de control, app Hono, RPC
  src/db/migrator.ts             NUEVO   runner de migraciones por journal (de la prueba)
  src/db/migrations.ts           NUEVO   lista {tag, sql} importada de los .sql
  src/db/client.ts               REESCRITO  ALS + proxy `db` sobre drizzle durable-sqlite
  src/db/control.ts              REESCRITO  `controlDb` (adaptador prepare/get/all/run sobre ctx.storage.sql) + funciones actuales
  src/lib/argon.ts               NUEVO   hash/verify argon2id wasm (de la prueba) + needsRehash
  src/lib/crypto.ts              MODIFICADO usa lib/argon.ts
  src/lib/rate-limit.ts          NUEVO   contadores en ctx.storage.kv
  src/lib/http.ts                NUEVO   tipos Hono (AppEnv), cookies, ip, errores → JSON, headers
  src/lib/export.ts              NUEVO   exportación JSON de todas las tablas del DO
  src/middleware/*.ts            PORTADOS a Hono (auth, authorization, module, platform-auth)
  src/modules/*/routes.ts        PORTADOS a Hono (services y repositories sin cambios salvo lo indicado)
  src/modules/ops/               NUEVO   POST /internal/ops
  scripts/ops.ts                 NUEVO   CLI local (`pnpm ops`)
  src/tests/*.test.ts            PORTADOS a vitest-pool-workers
  src/types/modules.d.ts         NUEVO   declaraciones *.sql, *.wasm, argon2id/lib/setup.js
apps/web/public/_headers         NUEVO   CSP y headers de seguridad de las páginas
apps/web/vite.config.ts          MODIFICADO proxy → 8787 con xfwd
deploy/DEPLOY.md                 REESCRITO para Cloudflare
ELIMINADOS: Dockerfile, deploy/{docker-compose.yml,Caddyfile,backup.sh,.env.example,ACTUALIZAR-VPS.md},
  apps/server/{drizzle.config.ts,src/index.ts,src/app.ts,src/config.ts,src/middleware/tenant.ts,
  src/middleware/security-headers.ts,src/jobs/,src/scripts/,src/db/seed.ts,src/db/tests/,src/lib/constants.ts si queda vacío}
```

Tipos compartidos de las tareas (definidos en `src/env.ts` y `src/lib/http.ts`):

```ts
interface Env {
  TENANT: DurableObjectNamespace<TenantDO>;
  PLATFORM: DurableObjectNamespace<PlatformDO>;
  ASSETS: Fetcher;
  BACKUPS: R2Bucket;
  TENANT_BASE_DOMAIN: string;
  ENVIRONMENT: 'production' | 'development' | 'test';
  DEV_TENANT?: string;
  BCCR_API_TOKEN?: string;
  OPS_TOKEN?: string;
}
type AppEnv = { Bindings: Env; Variables: { session?: Session; superadmin?: SuperadminSession } };
```

---

### Task 1: Herramientas, esqueleto del Worker y arnés de tests

**Files:**
- Modify: `apps/server/package.json`, `pnpm-lock.yaml`, `.gitignore` (añadir `.dev.vars`, `.wrangler/`)
- Create: `apps/server/wrangler.jsonc`, `apps/server/vitest.config.ts`, `apps/server/.dev.vars.example`, `src/env.ts`, `src/worker.ts`, `src/do/tenant-do.ts`, `src/do/platform-do.ts`, `src/types/modules.d.ts`, `src/tests/runtime.test.ts`

**Interfaces:**
- Produces: `Env` (arriba); `export class TenantDO extends DurableObject<Env>`, `export class PlatformDO extends DurableObject<Env>` (vacías salvo `fetch` → 501); `export default { fetch, scheduled } satisfies ExportedHandler<Env>`; scripts `dev` = `wrangler dev --env dev --port 8787`, `test` = `vitest run`, `deploy` = `wrangler deploy`, `ops` = `tsx scripts/ops.ts`.

- [ ] **Step 1: Dependencias.** Añadir `hono@^4`, `argon2id@^1`, subir `drizzle-orm` a `^0.44`; dev: `wrangler@^4.149`, `@cloudflare/workers-types@^5`, `vitest`, `@cloudflare/vitest-pool-workers` (versiones compatibles entre sí según su documentación vía Context7). Quitar aún nada (las dependencias de Node se van en la Tarea 9).
- [ ] **Step 2: `wrangler.jsonc`.** Producción: `name: "dosuxsoft"`, `main: "src/worker.ts"`, flags de Global Constraints, `routes: [{ pattern: "*.dosuxsoft.com/*", zone_name: "dosuxsoft.com" }]`, `assets: { directory: "../web/dist", binding: "ASSETS", not_found_handling: "single-page-application", run_worker_first: ["/api/*", "/auth/*", "/platform/*", "/internal/*", "/health"] }`, `durable_objects.bindings` TENANT/PLATFORM, `migrations: [{ tag: "v1", new_sqlite_classes: ["TenantDO", "PlatformDO"] }]`, `r2_buckets: [{ binding: "BACKUPS", bucket_name: "dosuxsoft-backups" }]`, `triggers.crons: ["15 * * * *", "0 9 * * *"]`, `vars: { TENANT_BASE_DOMAIN: "dosuxsoft.com", ENVIRONMENT: "production" }`, `rules: [{ type: "Text", globs: ["**/*.sql"] }]`, `observability.enabled: true`. `env.dev`: `vars` con `TENANT_BASE_DOMAIN: "localhost"`, `ENVIRONMENT: "development"`, `DEV_TENANT: "taller"`, sin `routes`, R2 `dosuxsoft-backups-dev`.
- [ ] **Step 3: Test que falla** — `src/tests/runtime.test.ts`:

```ts
it('AsyncLocalStorage conserva el contexto a través de await dentro de un DO', async () => {
  const res = await SELF.fetch('https://taller.dosuxsoft.com/internal/runtime-check');
  expect(await res.json()).toEqual({ als: 'taller' });
});
it('WebAssembly precompilado de argon2id carga', async () => { /* mismo endpoint devuelve wasm: true */ });
```

El endpoint `/internal/runtime-check` existe **solo** en el entorno de tests (`ENVIRONMENT=test` en `vitest.config.ts` → `miniflare.bindings`), y se borra al terminar la Tarea 2.
- [ ] **Step 4:** `pnpm --filter @sipnato/server test` → FAIL (501).
- [ ] **Step 5:** Implementar el esqueleto mínimo para que pase (ALS con `node:async_hooks`, `await` intermedio, `WebAssembly.instantiate` del `simd.wasm`).
- [ ] **Step 6:** Test → PASS; `wrangler deploy --dry-run` → sin errores de configuración.
- [ ] **Step 7: Commit** `Fase G: wrangler, esqueleto del Worker y tests en workerd`.

### Task 2: BD por negocio en el DO, migraciones y argon2id

**Files:**
- Create: `src/db/migrator.ts`, `src/db/migrations.ts`, `src/lib/argon.ts`, `src/tests/migrations.test.ts` (reemplaza al actual), `src/tests/argon.test.ts`
- Modify: `src/db/client.ts` (reescrito), `src/lib/crypto.ts`, `src/do/tenant-do.ts`, `src/modules/users/service.ts` (rehash en `verifyCredentials`)

**Interfaces:**
- Consumes: `Env`, `TenantDO` (Tarea 1).
- Produces:
  - `runMigrations(storage: DurableObjectStorage, migrations: Migration[]): { applied: string[]; bookmark: string | null }` — tabla `__migrations(tag TEXT PRIMARY KEY, applied_at TEXT)`; antes de aplicar alguna pendiente en una BD que ya tiene tablas, guarda `await storage.getCurrentBookmark()` en `ctx.storage.kv` bajo `pre-migracion:<tag>` (por eso el DO llama a `runMigrations` dentro de `blockConcurrencyWhile` async). Sentencias separadas por `--> statement-breakpoint`; `PRAGMA` que falle se ignora; cada archivo en `storage.transactionSync`.
  - `type Migration = { tag: string; sql: string }`; `MIGRATIONS: Migration[]` en orden de `_journal.json` (generado a mano con imports `import m0000 from './migrations/0000_….sql'`).
  - `db/client.ts`: `type TenantDb = DrizzleSqliteDODatabase<typeof schema>`; `interface RequestContext { slug: string; db: TenantDb; actor: Actor | null; env: Env }`; `runInTenant<T>(ctx: RequestContext, fn: () => T): T`; `currentTenant(): RequestContext`; `setActor(actor: Actor): void`; `currentActorId(): number | null`; `currentEnv(): Env`; `export const db: TenantDb` (proxy que lanza `Error('db usado fuera de un negocio')` sin contexto). Se eliminan `tenantDbPath`, `tenantBackupDir`, `openTenantDb`, `closeAllTenantDbs`, `enterTenantContext`, `runWithTenant`.
  - `lib/argon.ts`: `ARGON_PARAMS = { m: 19456, t: 2, p: 1 }`; `argonHash(secret: string): Promise<string>`; `argonVerify(secret: string, encoded: string): Promise<boolean>`; `needsRehash(encoded: string): boolean`.
  - `lib/crypto.ts`: mismas exportaciones de hoy; `hashPassword`, `verifyPassword`, `hashRecoveryCode`, `verifyRecoveryCode`, `hashSetupCode`, `verifySetupCode` delegan en `lib/argon.ts`; `DUMMY_HASH` regenerado con los nuevos parámetros; `generateSessionToken`/`hashSessionToken` usan Web Crypto (`crypto.getRandomValues`, `crypto.subtle.digest('SHA-256')` → **pasa a `async`**; actualizar llamadores en `lib/session.ts`).
- [ ] **Step 1: Tests que fallan**:

```ts
// migrations.test.ts
it('un DO nuevo queda con las 11 migraciones y las tablas del schema', …); // __migrations tiene 11 filas; existen users, sales, business_profile, customer_notifications
it('dos peticiones simultáneas al primer arranque migran una sola vez', …); // Promise.all de 2 RPC → ambas ven 11 filas, sin error de "table already exists"
it('una migración nueva sobre una BD con datos guarda el bookmark pre-migración', …); // runMigrations con una 0011 de prueba → kv tiene 'pre-migracion:0011_prueba'
// argon.test.ts
it('verifica un hash de la librería argon2 de Node (m=65536,t=3,p=4)', …); // fixture src/tests/fixtures/node-argon2.txt ('clave-compat-123')
it('needsRehash es true para m=65536 y false para m=19456,t=2,p=1', …);
it('login con hash viejo lo reemplaza por uno con los parámetros nuevos', …); // verifyCredentials → users.password_hash empieza con '$argon2id$v=19$m=19456,t=2,p=1$'
it('contraseña incorrecta no cambia el hash', …);
```

- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar según Interfaces. `TenantDO` constructor: `drizzle(ctx.storage, { schema })`, `ctx.blockConcurrencyWhile(async () => { runMigrations(…); bootstrapTenant() })`, donde `bootstrapTenant` es el bootstrap de contadores/settings que hoy hace `openTenantDb`. El rehash va en `verifyCredentials` tras una verificación correcta.
- [ ] **Step 4:** Tests → PASS. Borrar `/internal/runtime-check` y su test.
- [ ] **Step 5: Commit** `Fase G: BD por negocio en Durable Object, migraciones y argon2id wasm`.

### Task 3: Capa HTTP en Hono y módulos del negocio

**Files:**
- Create: `src/lib/http.ts`, `src/lib/rate-limit.ts`, `src/tenant-app.ts`
- Modify: `src/middleware/{auth,authorization,module}.ts`, `src/lib/session.ts`, `src/lib/errors.ts` (si hace falta el mapeo), todos los `src/modules/*/routes.ts` **excepto** `platform` y `subscription`; `src/do/tenant-do.ts`
- Test: portar `src/tests/{users,inventory,business,currency}.test.ts` a vitest (`SELF.fetch` con `https://<slug>.dosuxsoft.com/...`) + helper `src/tests/helpers.ts`

**Interfaces:**
- Consumes: `runInTenant`, `db`, `currentEnv` (Tarea 2).
- Produces:
  - `lib/http.ts`: `type AppEnv`; `clientIp(c): string` (`CF-Connecting-IP`, o `'127.0.0.1'` en desarrollo/tests); `setSessionCookie(c, name, token, maxAgeSec)`, `clearSessionCookie(c, name)` (sin `Domain`, `Path=/`, `Secure` salvo desarrollo); `errorHandler(err, c)` (AppError → su código/status; ZodError → 400 `VALIDACION`; resto → log + 500 `ERROR_INTERNO`); `apiHeaders` middleware (`Cache-Control: no-store` + headers de §6.6 sin CSP); `parseBody<T>(c, schema): Promise<T>` (lanza 400).
  - `lib/rate-limit.ts`: `hit(kv: DurableObjectStorage['kv'], key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSec: number }` (ventana fija, clave `rl:<key>:<inicio de ventana>`, borra la ventana anterior); `rateLimit(name: string, limit: number, windowMs: number, key?: (c) => string)` middleware Hono → 429 `{ error: { code: 'DEMASIADOS_INTENTOS', message } }` + `Retry-After`.
  - `middleware/auth.ts`: `requireAuth: MiddlewareHandler<AppEnv>`, `requireRole(...roles: UserRole[]): MiddlewareHandler<AppEnv>`; `authorizeOrEscalate(c, permission)`; `registerModuleRoutes(app: Hono<AppEnv>, module: ModuleKey, routes: Hono<AppEnv>, prefix: string)`.
  - `tenant-app.ts`: `createTenantApp(): Hono<AppEnv>` que monta `/auth/*` y `/api/*` de todos los módulos del negocio, `apiHeaders`, rate limit global 200/min por IP y `errorHandler`; `notFound` → 404 JSON `NO_ENCONTRADO`.
  - `TenantDO.initialize(slug: string, assignment: AssignBusiness): void` — guarda `slug` en `ctx.storage.kv`, aplica la asignación de tipo y módulos (`applyAssignment`); idempotente.
  - `TenantDO.fetch(req)` → `runInTenant({ slug, db, actor: null, env }, () => app.fetch(req, env))`. El slug llega en el header interno `X-Dosuxsoft-Tenant` que pone el Worker (Tarea 6); si no coincide con el `slug` guardado en kv, o el DO nunca se inicializó, responde 404 `NEGOCIO_NO_ENCONTRADO`.
  - Las lecturas que hoy van a `control.db` desde un negocio (`/auth/setup` código de activación, `/api/subscription`, tipo de cambio) quedan **temporalmente** con un stub `platformClient(env)` que lanza `NotImplemented`; la Tarea 5 lo implementa. Sus tests se portan en la Tarea 5.
- [ ] **Step 1: Portar los tests** de users/inventory/business/currency (los casos de hoy, mismas aserciones; los de cobro en dólares que necesitan tipo de cambio usan el respaldo manual `usd_manual_rate`). Añadir:

```ts
it('login 6 veces desde la misma IP → el sexto es 429 con Retry-After', …);
it('la cookie de sesión no lleva Domain y lleva Secure, HttpOnly, SameSite=Strict', …);
it('error interno responde { error: { code: "ERROR_INTERNO" } } sin stack', …);
it('toda respuesta de /api lleva Cache-Control: no-store', …);
```

El helper `createTestTenant(slug, { owner })` llama `TenantDO.initialize` por RPC (`runInDurableObject` o el stub) y crea el dueño con contraseña sin pasar por el código de activación.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Portar middleware y rutas. Regla: el cuerpo de cada handler llama al mismo service que hoy; `request.ip` → `clientIp(c)`; `reply.code(x).send(y)` → `c.json(y, x)`; `preHandler` → middleware de la ruta.
- [ ] **Step 4:** Tests → PASS; `tsc --noEmit` limpio.
- [ ] **Step 5: Commit** `Fase G: rutas de los negocios en Hono dentro del Durable Object`.

### Task 4: Descarga de respaldo como JSON

**Files:**
- Create: `src/lib/export.ts`
- Modify: `src/modules/settings/routes.ts`, `apps/web/src/features/settings/*` (texto y nombre del archivo), test en `src/tests/backup.test.ts`

**Interfaces:**
- Produces: `exportTenant(storage: DurableObjectStorage): { exportedAt: string; schemaVersion: string; tables: Record<string, unknown[]> }` — todas las tablas de `sqlite_master` excepto `sqlite_%`, `_cf_%` y `__migrations`; `schemaVersion` = último tag aplicado. `GET /api/settings/backup/download` (solo dueño, 5/h) responde ese JSON con `Content-Disposition: attachment; filename="dosuxsoft-<slug>-<YYYY-MM-DD>.json"`.
- [ ] **Step 1: Tests:** el dueño descarga y `tables.sales` contiene la venta creada; un admin recibe 403; el sexto intento en la hora es 429; el JSON de un negocio nunca contiene filas de otro (dos negocios con ventas distintas).
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** En Configuración, el botón dice "Descargar respaldo (JSON)".
- [ ] **Step 4: Commit** `Fase G: respaldo del negocio descargable en JSON`.

### Task 5: PlatformDO, panel y RPC entre objetos

**Files:**
- Create: `src/platform-app.ts`, `src/lib/platform-client.ts`
- Modify: `src/db/control.ts` (reescrito), `src/do/platform-do.ts`, `src/do/tenant-do.ts` (métodos RPC), `src/modules/platform/{routes,service,repository}.ts`, `src/modules/subscription/routes.ts`, `src/modules/auth/service.ts`, `src/lib/exchange-rate.ts`, `src/middleware/platform-auth.ts`
- Test: portar `src/tests/platform.test.ts`, `src/tests/tenancy.test.ts` (los casos que no son de enrutado, que van en la Tarea 6), casos de setup/subscription/tipo de cambio de los tests de la Tarea 3

**Interfaces:**
- Consumes: `createTenantApp`, `runInTenant`, `TenantDO.initialize`, `lib/http.ts`, `rate-limit.ts`.
- Produces:
  - `db/control.ts`: `controlDb.prepare<P extends unknown[], R>(sql)` → `{ get(...p): R | undefined; all(...p): R[]; run(...p): { changes: number; lastInsertRowid: number } }`, sobre `ctx.storage.sql.exec` (cursor `.toArray()`, `rowsWritten`, `SELECT last_insert_rowid()`), resuelto **en cada llamada** desde un ALS de plataforma (`runInPlatform(storage, fn)`), y que lanza fuera de él: las `prepare` a nivel de módulo de `platform/repository.ts` siguen funcionando sin cambios. `controlTransaction(fn)` → `storage.transactionSync(fn)`. Las tablas se crean igual que hoy (`CREATE TABLE IF NOT EXISTS` + `ALTER` condicionales) en el constructor de `PlatformDO`.
  - RPC de `PlatformDO` (todas entran a `runInPlatform`): `resolveTenant(slug: string): { status: TenantStatus } | null`; `consumeSetupCode(slug: string, code: string): Promise<boolean>`; `subscriptionInfo(slug: string): SubscriptionInfo | null`; `latestExchangeRate(): ExchangeRateRow | null`; `refreshExchangeRate(): Promise<void>`; `listActiveSlugs(): string[]`; `exportControl(): ReturnType<typeof exportTenant>`.
  - RPC de `TenantDO` (además de `initialize`, de la Tarea 3): `platformSummary(): { activated: boolean; template: BusinessTemplate; modules: ModuleKey[]; users: number; lastSaleAt: string | null } | null` (null si nunca se inicializó, sin crear tablas: revisa kv `slug` antes); `assignBusiness(input: AssignBusiness, meta: AuditMeta): { before; after }`; `resetOwner(): { username: string; tempPassword: string; recoveryCode: string }` (para la Tarea 8).
  - `lib/platform-client.ts`: `platform(env: Env): DurableObjectStub<PlatformDO>` (= `env.PLATFORM.get(env.PLATFORM.idFromName('platform'))`).
  - Llamadores que pasan a `async`: `getExchangeRateInfo()` (y sus usos en ventas en dólares y dashboard), `tenantSubscriptionInfo`, el setup del dueño. Donde hoy `platform/service.ts` usa `runWithTenant(slug, …)`, pasa a `await env.TENANT.get(idFromName(slug)).<rpc>()`.
  - `platform-app.ts`: `createPlatformApp(): Hono<AppEnv>` con `/platform/*` y `/health` (`{ status: 'ok', environment, time }`).
  - **Regla de unicidad (§6.13) en el alta de negocio:** calcular el hash del código de activación primero; verificar e insertar en `tenants` sin `await` en medio; después `initialize` por RPC.
- [ ] **Step 1: Portar tests** de platform (todos los de hoy) y de aislamiento de tenancy que no son de Host. Añadir:

```ts
it('el panel lista un negocio cuyo DO nunca se inicializó como "Sin activar" sin crear su BD', …); // platformSummary → null; kv del TenantDO sigue vacío
it('el setup del dueño consume el código por RPC y un segundo uso falla', …);
it('/api/subscription de un negocio refleja un pago registrado en el panel', …);
it('cobro en dólares usa el tipo del BCCR guardado en PlatformDO si es de los últimos 4 días', …);
```

- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3: Commit** `Fase G: panel de la plataforma en su Durable Object y RPC con los negocios`.

### Task 6: Enrutador del Worker, Static Assets y headers

**Files:**
- Modify: `src/worker.ts`
- Create: `apps/web/public/_headers`, `src/tests/routing.test.ts` (incluye los casos de Host de `tenancy.test.ts`)

**Interfaces:**
- Consumes: `platform(env)`, `TenantDO.fetch`, `PlatformDO.fetch`.
- Produces: `routeHost(host: string, env: Env): { kind: 'platform' } | { kind: 'tenant'; slug: string } | null` (exportada para test) — minúsculas, sin puerto; debe terminar en `.${TENANT_BASE_DOMAIN}` con un solo label antes; `admin` → plataforma; slug válido con `isValidSlug` (shared) y no reservado. Con `ENVIRONMENT=development`: si llega `X-Forwarded-Host` se usa ese; `localhost` sin subdominio → `DEV_TENANT`.
- `fetch`: si el path no es de API, `env.ASSETS.fetch(req)`. Si es de API: `routeHost` null → 404 `NEGOCIO_NO_ENCONTRADO`; plataforma → solo `/platform/*`, `/internal/ops` y `/health`, el resto 404; negocio → `/platform/*` y `/internal/*` dan 404, `resolveTenant(slug)` (caché `Map` por isolate, 30 s) → null 404 / `suspended` 403 `NEGOCIO_SUSPENDIDO` / activo → reenviar al `TenantDO` con `X-Dosuxsoft-Tenant: slug` (se borra cualquier `X-Dosuxsoft-Tenant` que venga del cliente).
- `_headers`: para `/*` los headers de §6.6 con la CSP exacta de `CLAUDE.md`; `/assets/*` con `Cache-Control: public, max-age=31536000, immutable`.
- [ ] **Step 1: Tests:**

```ts
it.each(['evil.com', 'a.b.dosuxsoft.com', 'www.dosuxsoft.com', 'api.dosuxsoft.com', '../x.dosuxsoft.com'])('Host %s → 404 sin crear DO', …);
it('en producción X-Forwarded-Host: otro.dosuxsoft.com no cambia el negocio', …);
it('X-Dosuxsoft-Tenant enviado por el cliente se descarta', …);
it('negocio suspendido → 403; inexistente → 404', …);
it('GET /caja → index.html; GET /api/no-existe → 404 JSON; /platform/tenants desde un negocio → 404', …);
it('cookie de un negocio no abre sesión en otro', …); // ya existente en tenancy, se conserva
```

(Los Static Assets en tests: `assets` en `vitest.config.ts` apuntando a un `dist` mínimo de fixtures con `index.html`.)
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3: Commit** `Fase G: enrutado por subdominio, SPA y headers de seguridad`.

### Task 7: Cierre automático, tipo de cambio, mantenimiento diario y R2

**Files:**
- Modify: `src/worker.ts` (`scheduled`), `src/do/tenant-do.ts` (`alarm`, `dailyMaintenance`), `src/do/platform-do.ts`, `src/modules/settings/service.ts` (reprogramar alarma al guardar)
- Create: `src/lib/auto-close.ts`, `src/tests/scheduled.test.ts`
- Delete: `src/jobs/` completo (su lógica se mueve)

**Interfaces:**
- Produces:
  - `nextAutoCloseAt(now: Date, autoCloseTime: string): Date` — próxima ocurrencia de `HH:MM` en hora de CR (UTC−6), estrictamente después de `now`.
  - `TenantDO.scheduleAutoClose(): void` — si `auto_close_enabled === 'true'`, `setAlarm(nextAutoCloseAt(now, auto_close_time))`; si no, `deleteAlarm()`. Se llama en `initialize`, al arrancar el DO y tras `PUT /api/settings`.
  - `TenantDO.alarm()` — si hay caja abierta con `openedAt` anterior a la hora programada de esta alarma, `closeCashRegister('auto', <hora programada ISO>, { ip: null, userAgent: 'auto-close' })`; luego `scheduleAutoClose()`.
  - `TenantDO.dailyMaintenance(): Promise<void>` — borra sesiones vencidas y escribe `exportTenant` en R2 `tenants/<slug>/<YYYY-MM-DD>.json`.
  - `scheduled(event)`: `15 * * * *` → `platform.refreshExchangeRate()`; `0 9 * * *` → `platform` limpia sesiones del panel y escribe `_control/<fecha>.json`, y para cada `listActiveSlugs()` llama `dailyMaintenance()` con `Promise.allSettled` (un negocio que falla se loguea y no frena a los demás).
- [ ] **Step 1: Tests:** `nextAutoCloseAt` (antes de la hora hoy → hoy; después → mañana; cruce de medianoche UTC); alarma con caja abierta cierra con `closedAt` = hora programada; alarma sin caja no hace nada y se reprograma; desactivar el cierre borra la alarma (`getAlarm()` null); `scheduled` diario deja un objeto por negocio activo en R2 y ninguno para el suspendido; un error en un negocio no impide el respaldo del siguiente; cron horario guarda el tipo de cambio (fetch del BCCR simulado con `fetchMock`).
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3: Commit** `Fase G: cierre automático con alarmas, crons y respaldos en R2`.

### Task 8: Operaciones de emergencia (`/internal/ops`) y CLI

**Files:**
- Create: `src/modules/ops/routes.ts`, `src/modules/ops/service.ts`, `scripts/ops.ts`, `src/tests/ops.test.ts`
- Delete: `src/scripts/` (tenant, superadmin, reset-admin)

**Interfaces:**
- Produces: `POST /internal/ops` solo en el host `admin.`; `Authorization: Bearer <OPS_TOKEN>` comparado en tiempo constante (SHA-256 de ambos y comparación byte a byte); sin `OPS_TOKEN` configurado → 404; límite 10/15 min por IP; cada llamada (válida o no) en `platform_audit_log` como `OPS_<COMANDO>` / `OPS_AUTH_FAILED`. Cuerpo `{ command, args }` validado con zod:
  - `superadmin-create {username}` → `{ tempPassword }`; `superadmin-reset {username}` → `{ tempPassword }` (cierra sus sesiones); `superadmin-disable|enable {username}`; `superadmin-list`.
  - `tenant-list`; `tenant-create {slug, name}` → `{ setupCode }` (asigna "generico"); `tenant-suspend|activate {slug}`; `setup-code {slug}` → `{ setupCode }`.
  - `reset-owner {slug}` → `TenantDO.resetOwner()` (contraseña temporal + nuevo recovery code + cierra todas las sesiones del negocio).
  - `restore-tenant {slug, bookmark}` → `ctx.storage.onNextSessionRestoreBookmark(bookmark)` + `ctx.abort()`; `bookmarks {slug}` → lista de `pre-migracion:*` y el bookmark actual.
- `scripts/ops.ts`: `pnpm ops <command> [k=v …] [--url https://admin.dosuxsoft.com]`; lee `OPS_TOKEN` del entorno (nunca como argumento), imprime el JSON.
- [ ] **Step 1: Tests:** sin token → 401; token incorrecto → 401 y queda `OPS_AUTH_FAILED`; desde un host de negocio → 404; `superadmin-create` + login en el panel con esa contraseña; `reset-owner` invalida la sesión vieja del dueño; `restore-tenant` vuelve al estado del bookmark (venta creada después ya no está).
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3: Commit** `Fase G: operaciones de emergencia por endpoint con secreto`.

### Task 9: Desarrollo local, frontend y limpieza

**Files:**
- Modify: `apps/web/vite.config.ts` (`target: 'http://localhost:8787'`, `xfwd: true`, `changeOrigin: false`; añadir `/internal`), `package.json` raíz (`dev:server` = `pnpm --filter @sipnato/server dev`; `dev:web` espera `http://localhost:8787/health`), `apps/server/package.json` (quitar `fastify`, `@fastify/*`, `better-sqlite3`, `argon2`, `node-cron`, `drizzle-kit`, `pino-pretty`, `@types/better-sqlite3`, `@types/node-cron`; scripts viejos), `eslint.config.*` si referencia archivos borrados, `.prettierignore`
- Delete: los archivos de "ELIMINADOS" en la estructura de arriba
- [ ] **Step 1:** `pnpm install`; `pnpm -r exec tsc --noEmit`; `pnpm lint`; `pnpm format:check`; `pnpm --filter @sipnato/server test` → todo limpio.
- [ ] **Step 2:** `pnpm dev` y en el navegador (`http://taller.localhost:5174` con `DEV_TENANT` / `http://admin.localhost:5174`): crear superadmin con `pnpm ops superadmin-create username=admin --url http://admin.localhost:8787` (`OPS_TOKEN` de `.dev.vars`), alta de negocio desde el panel, activación con el código, venta en colones y en dólares, cierre de caja, panel con el pago. Credenciales de prueba en `apps/server/data/CREDENCIALES-DEV.txt`.
- [ ] **Step 3: Commit** `Fase G: desarrollo local con wrangler y fuera Fastify, Docker y Caddy`.

### Task 10: Despliegue, DNS y documentación

**Files:**
- Modify: `deploy/DEPLOY.md` (reescrito), `CLAUDE.md` (§1 tipo de sistema, §3 stack e infraestructura, §4 diagrama, §6.3, §6.4, §6.6, §6.11, §6.12, §6.14 ops por endpoint, §7 reglas multi-negocio/jobs/migraciones, §8 variables, §9 carpetas, §11 historial), `ROADMAP.md` (Fase G `[x]`), `README.md`

- [ ] **Step 1: Recursos.** `wrangler r2 bucket create dosuxsoft-backups` y regla de vida de 30 días (`wrangler r2 bucket lifecycle add`); `wrangler secret put OPS_TOKEN` (valor de `openssl rand -hex 32`, guardado en `apps/server/data/CREDENCIALES-PRODUCCION.txt`) y `BCCR_API_TOKEN` (desde `apps/server/.env`). Confirmar con `wrangler whoami` que la cuenta es la correcta antes de cada comando.
- [ ] **Step 2: Deploy.** `pnpm --filter @sipnato/web build && pnpm --filter @sipnato/server deploy`. Verificar en la lista de Workers que `seitcr` no cambió.
- [ ] **Step 3: DNS (pedir confirmación al usuario antes).** Registro `*` de `dosuxsoft.com`: de `A 185.166.215.228` (Solo DNS) a `AAAA 100::` **Proxied**. No tocar ningún otro registro.
- [ ] **Step 4: Verificación en producción.** `curl https://admin.dosuxsoft.com/health` → `ok`; `pnpm ops superadmin-create username=admin` (contraseña al archivo de credenciales); login en el panel; crear un negocio de prueba, activarlo, una venta, descargar el respaldo JSON; `https://noexiste.dosuxsoft.com/api/auth/me` → 404; headers de seguridad y certificado válido en `https://<slug>.dosuxsoft.com`. Borrar el negocio de prueba (suspenderlo) si el usuario lo prefiere.
- [ ] **Step 5: Limpieza (pedir confirmación).** `wrangler delete dosuxsoft-poc`.
- [ ] **Step 6: Docs** según la lista de Files; `/grill-me` sobre el backend de la Fase G y corregir lo que encuentre.
- [ ] **Step 7: Commit** `Fase G: despliegue en Cloudflare y documentación` y PR a `main`.
