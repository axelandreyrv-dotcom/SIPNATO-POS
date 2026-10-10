# Fase G — Dosuxsoft POS en Cloudflare Workers (diseño)

Fecha: 2026-10-10 · Estado: propuesto, pendiente de revisión del usuario

## Objetivo

Sacar el sistema del VPS (ya borrado) y correrlo completo en Cloudflare con el plan **Workers Paid ($5/mes)** de la
cuenta `axelandreyrv@gmail.com`, en `*.dosuxsoft.com`, sin tocar `seitcr.com` ni su Worker `seitcr`.

## Punto de partida comprobado (prueba de concepto del 2026-10-10)

Worker `dosuxsoft-poc` en `dosuxsoft-poc.axelandreyrv.workers.dev`:

- **argon2id** con WebAssembly precompilado (`argon2id` de OpenPGP.js, archivos `.wasm` importados): verifica hashes
  generados por la librería `argon2` de Node (`m=65536,t=3,p=4`). CPU medida: ~130 ms por cálculo con
  `m=19456,t=2,p=1` y ~340–550 ms con la configuración actual. 16 cálculos simultáneos sin errores de memoria.
  `hash-wasm` **no sirve**: compila WebAssembly en tiempo de ejecución y Workers lo prohíbe.
- **Durable Object con SQLite** por negocio: las 11 migraciones (`0000`–`0010`) corren sin cambios (el `PRAGMA` de
  la 0001 no falla); Drizzle `durable-sqlite` con el `schema.ts` real funciona con la API síncrona
  (`.get()`, `.run()`, `db.transaction`) y revierte una transacción fallida. ~1 ms de CPU por operación.

## Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | **Un Durable Object (DO) por negocio** (`TenantDO`, id = `idFromName(slug)`) con su propio SQLite, y **un DO de plataforma** (`PlatformDO`, id = `idFromName('platform')`) que reemplaza a `control.db`. | Mantiene el aislamiento "una BD por negocio" de la Fase A. Un DO es de un solo hilo: equivale al "SQLite single-writer" actual. |
| D2 | **La petición HTTP se atiende dentro del DO.** El Worker solo decide el destino por el `Host` y reenvía: `admin.` → `PlatformDO`, `<slug>.` → `TenantDO` (si el negocio existe y está activo). | Services y repositories siguen síncronos con `db` como hoy; no hay una llamada entre DO por consulta. |
| D3 | **Hono** reemplaza a Fastify. Se portan solo las rutas y middlewares; services y repositories no cambian salvo donde leen datos de la plataforma (pasan a `async` por RPC). | Fastify no corre en Workers. |
| D4 | **Contexto con `AsyncLocalStorage`** (`nodejs_compat`): `db`, actor y slug viven en el contexto del request dentro del DO, igual que hoy. | Los repositories importan `db` sin cambios. |
| D5 | **argon2id `m=19456` KiB, `t=2`, `p=1`** (mínimo OWASP para argon2id). Al iniciar sesión con un hash de otros parámetros, se vuelve a guardar con los nuevos. | Cabe con margen en 128 MB por isolate y baja la CPU por login de ~500 ms a ~130 ms. |
| D6 | **Se borra todo y se empieza de cero.** No hay migración de datos (no hay clientes). Las migraciones `0000`–`0010` se conservan tal cual. | Decisión del usuario, 2026-10-10. |
| D7 | **Operaciones de emergencia por un endpoint con secreto** (`POST /internal/ops`, `Authorization: Bearer <OPS_TOKEN>`, secreto de Workers de 256 bits, comparación en tiempo constante, auditado) y un CLI local `pnpm ops <comando>` que lo llama. Reemplaza a `scripts/tenant.ts`, `superadmin.ts` y `reset-admin.ts`. | En Workers no hay SSH. El secreto cumple el papel que tenía la llave SSH: quien lo tiene administra la plataforma. **Cambia la regla "no hay alta de superadmin por HTTP" de `CLAUDE.md` §6.12/§6.14.** |
| D8 | **Respaldos:** Point-in-Time Recovery de cada DO (30 días, incluido) + exportación JSON diaria de cada negocio y de la plataforma a **R2** (`dosuxsoft-backups`, regla de vida de 30 días). La descarga del dueño pasa a ser ese JSON (`dosuxsoft-<slug>-<fecha>.json`) generado al pedirlo. Antes de migrar un negocio se guarda el *bookmark* de PITR en vez de una copia del archivo. | En un DO no hay archivo `.db` que copiar. |
| D9 | **Límites de intentos** con contadores en la KV síncrona del DO (`ctx.storage.kv`), con las mismas reglas de §6.4 (login 5/15 min, recover 3/30 min, descarga de respaldo 5/h, 200/min por IP). La IP sale de `CF-Connecting-IP`. | `@fastify/rate-limit` no existe en Workers y el binding de rate limiting de Cloudflare solo admite ventanas de 10 o 60 s. |
| D10 | **Tareas programadas:** Cron Triggers del Worker — `15 * * * *` (tipo de cambio del BCCR, en `PlatformDO`) y `0 9 * * *` (03:00 CR: limpieza de sesiones y exportación a R2 de cada negocio activo). **El cierre automático de caja usa una alarma por negocio** (`ctx.storage.setAlarm`) programada a la próxima `auto_close_time` en hora de CR; si la alarma llega tarde (caja abierta antes de la hora y hora ya pasada), cierra con `closedAt` = la hora programada. | Una tarea por minuto por negocio gasta peticiones de DO sin necesidad. |
| D11 | **Frontend como Static Assets del mismo Worker** (`apps/web/dist`, `not_found_handling: "single-page-application"`, `run_worker_first` para `/api/*`, `/auth/*`, `/platform/*`, `/internal/*`, `/health`). Los headers de seguridad de las páginas van en `apps/web/public/_headers`; los de la API los pone el Worker. | Reemplaza a Caddy. |
| D12 | **HTTPS y dominio:** ruta del Worker `*.dosuxsoft.com/*` (zona `dosuxsoft.com`). El registro DNS `*` pasa a **Proxied** (nube naranja) apuntando a `AAAA 100::`. Universal SSL cubre `*.dosuxsoft.com` sin costo. `dosuxsoft.com`, `www` y el correo no cambian (siguen "Solo DNS"). `workers_dev: false`. | Ya no hace falta `on_demand_tls` ni `/internal/tls-check`. |
| D13 | **Tests con `vitest` + `@cloudflare/vitest-pool-workers`** (corren en `workerd` con DO reales y almacenamiento aislado por archivo). Se portan los casos actuales; se descartan los que prueban detalles de Node (modo WAL, copia de archivo pre-migración). | `app.inject` de Fastify y `better-sqlite3` desaparecen. |
| D14 | **Desarrollo local:** `wrangler dev` (puerto 8787) + Vite (5174) con proxy `xfwd: true`. Solo con `ENVIRONMENT=development` el Worker toma el negocio de `X-Forwarded-Host`; en producción lo ignora. | El proxy de Vite no conserva el `Host` hacia `wrangler dev` de forma fiable. |
| D15 | **Se elimina la infraestructura del VPS:** `Dockerfile`, `deploy/docker-compose.yml`, `deploy/Caddyfile`, `deploy/backup.sh`, `deploy/.env.example`, `deploy/ACTUALIZAR-VPS.md`, `drizzle.config.ts`, `drizzle-kit`, `node-cron`, `better-sqlite3`, `argon2`, `fastify` y plugins. `DEPLOY.md` se reescribe para Cloudflare. | — |

## Arquitectura

```
Navegador ──HTTPS (Universal SSL *.dosuxsoft.com)──► Worker "dosuxsoft" (ruta *.dosuxsoft.com/*)
   │                                                    │
   │  /assets, páginas SPA  ◄── Static Assets (apps/web/dist, _headers)
   │                                                    │ /api /auth /platform /internal /health
   │                                    Host = admin.*  ├──► PlatformDO ("platform")
   │                                                    │       Hono: /platform/*, /internal/ops, /health
   │                                                    │       SQLite: tenants, superadmins, platform_sessions,
   │                                                    │       subscription_payments, platform_settings,
   │                                                    │       platform_audit_log, exchange_rates
   │                         Host = <slug>.* (activo)   └──► TenantDO (<slug>)
   │                                                            Hono: /auth/*, /api/*
   │                                                            SQLite: migraciones 0000–0010 (+ las que vengan)
   │                                                            alarma: cierre automático de caja
Cron Triggers ──► Worker.scheduled ──► PlatformDO.refreshExchangeRate() / cada TenantDO.dailyMaintenance() → R2
```

RPC entre objetos (métodos de clase, `DurableObjectStub`):

- `PlatformDO.resolveTenant(slug)` → `{ status: 'active' | 'suspended' } | null` (el Worker lo cachea 30 s por isolate).
- `PlatformDO.consumeSetupCode(slug, code)` → `boolean` (verifica y borra; lo usa `/auth/setup`).
- `PlatformDO.subscriptionInfo(slug)` → `SubscriptionInfo`; `PlatformDO.latestExchangeRate()` → `ExchangeRateRow | null`.
- `TenantDO.platformSummary()` → `{ activated, template, modules, users, lastSaleAt }`.
- `TenantDO.assignBusiness(input)` → `{ before, after }`; `TenantDO.initialize(slug, assignment)` (crea y migra).
- `TenantDO.exportSnapshot()` → `{ tables: Record<string, unknown[]> }`; `TenantDO.dailyMaintenance()`.

## Configuración (wrangler)

- Worker `dosuxsoft`, `compatibility_flags: ["nodejs_compat"]`, `workers_dev: false`, `observability.enabled: true`.
- Bindings: `TENANT` (TenantDO), `PLATFORM` (PlatformDO), `ASSETS`, `BACKUPS` (R2 `dosuxsoft-backups`).
- Vars: `TENANT_BASE_DOMAIN` (`dosuxsoft.com`; `localhost` en dev), `ENVIRONMENT` (`production` / `development`),
  `DEV_TENANT` (solo dev). Secrets: `BCCR_API_TOKEN`, `OPS_TOKEN`.
- Migración de DO: `new_sqlite_classes: ["TenantDO", "PlatformDO"]`.

## Fuera de alcance

- Migrar datos del sistema anterior (no existen).
- Importar un respaldo JSON de R2 a un DO (se restaura con PITR; el JSON es la copia externa). Se puede agregar después.
- Cambiar pantallas: el frontend no cambia salvo el proxy de desarrollo, el `_headers` y el texto de la descarga de respaldo.

## Riesgos

- **Límite de 128 MB por isolate** con varios DO en el mismo isolate haciendo argon2: la prueba aguantó 16 simultáneos;
  si aparece `exceededMemory`, bajar a `m=12288,t=3` (también OWASP).
- **`AsyncLocalStorage` en `workerd`:** soportado con `nodejs_compat`; el primer task lo verifica con un test antes de
  portar módulos.
- **`X-Forwarded-Host` solo en desarrollo:** un error aquí permitiría elegir negocio con un header. Test dedicado.
