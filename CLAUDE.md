# CLAUDE.md — Biblia del Proyecto Dosuxsoft POS

> Este archivo es la fuente de verdad del proyecto. Se actualiza al finalizar cada fase.
> Última actualización: 2026-10-11 · Estado: Fases A–G en `main`; **Fase G desplegada en producción en Cloudflare Workers** (`*.dosuxsoft.com`) — un Durable Object SQLite por negocio y otro para la plataforma · usuarios con roles · inventario · plantillas por tipo de negocio · cobro en dólares y avisos por WhatsApp · panel de la plataforma con cobro de la mensualidad

---

## 1. Identidad del Proyecto

| Campo | Valor |
|---|---|
| Nombre | Dosuxsoft POS (antes SIPNATO POS) |
| Propósito | Sistema POS multi-negocio — nació para un taller de celulares; se generaliza a otros tipos de tienda |
| País / Zona horaria | Costa Rica · `America/Costa_Rica` |
| Moneda | Colones costarricenses (₡). Los dólares solo se reciben en caja y se convierten (Fase E) |
| Usuarios | Por negocio: un **dueño**, administradores y cajeros (Fase B, ver §6.13) |
| Tipo de sistema | Aplicación web privada detrás de login · corre en Cloudflare Workers; cada negocio en su subdominio HTTPS (`<slug>.dosuxsoft.com`) con su propia BD (un Durable Object SQLite) |

---

## 2. Reglas de Desarrollo (NO NEGOCIABLES)

### 2.1 Antes de escribir código
- Leer este archivo completo.
- Confirmar en qué fase del ROADMAP se está trabajando.
- No avanzar a la siguiente fase sin haber completado la actual.

### 2.2 Documentación obligatoria continua
- **CLAUDE.md**: actualizar al finalizar cada fase (sección de estado, convenciones nuevas, decisiones tomadas).
- **ROADMAP.md**: marcar la fase como `[x] COMPLETADA` con fecha antes de continuar.
- Si se crea un nuevo archivo de configuración, migración o módulo, documentar su propósito aquí.

### 2.3 Flujo de trabajo Backend (ESTRICTO)
1. Desarrollo por fases definidas en el ROADMAP — sin saltarse pasos.
2. Toda lógica, endpoint, BD y arquitectura: aplicar skill `/using-superpowers`.
3. Al finalizar CADA fase de backend: invocar skill `/grill-me` para revisión técnica antes de continuar.

### 2.4 Flujo de trabajo Frontend (ESTRICTO)
1. Para interfaces y componentes: invocar skills `/impeccable` + `/design-taste-frontend`.
2. Para íconos: invocar skill `/ui-ux-pro-max` (íconos minimalistas, consistentes, escalables).
3. Diseño estricto: azul ejecutivo + blanco, moderno, minimalista, dark mode nativo.
4. **Estructura y patrones React:** invocar `/vercel-react-best-practices` + `/vercel-composition-patterns` al crear cualquier componente — hooks correctos, manejo de estado, composición limpia.
5. **Animaciones y navegación:** invocar `/vercel-react-view-transitions` para transiciones fluidas al cambiar entre módulos del dashboard.
6. **Excluido:** `/vercel-react-native-skills` — esta es una app web, no móvil.

### 2.4.1 Arquitectura visual — Dashboard Modular tipo Odoo
- La pantalla principal es una cuadrícula de módulos (POS, Reportes, Clientes, Caja, etc.).
- Cada módulo = ícono Lucide 32px + nombre + clic directo a la función.
- Personalidad de marca: **Modular · Intuitivo · Eficiente** (ver `PRODUCT.md`).
- Referencia: interfaz de módulos de Odoo — cuadrícula limpia, íconos claros, sin submenús anidados.
- `PRODUCT.md` y `DESIGN.md` son la fuente de verdad visual — leerlos antes de diseñar cualquier pantalla.

### 2.5 Regla de oro de seguridad
> **Nunca confiar en el frontend. Todo control de acceso, validación y autorización vive en el servidor.**

---

## 3. Stack Tecnológico

### Monorepo
| Herramienta | Versión objetivo | Propósito |
|---|---|---|
| pnpm | 12 (`packageManager` en `package.json`, instalado con Homebrew) | Gestor de paquetes + workspaces |
| TypeScript | ~5.x | Lenguaje único en todo el proyecto |
| Entorno de desarrollo | macOS (Apple Silicon) · Node 26 · Homebrew | Desde el 2026-10-14 ya no se desarrolla en Windows |
| ESLint + Prettier | latest | Linting y formateo uniforme |

### `apps/web` — Frontend SPA
| Herramienta | Propósito |
|---|---|
| React 19 | UI framework |
| Vite | Build tool + dev server |
| Tailwind CSS v4 | Estilos · paleta azul ejecutivo + dark mode |
| TanStack Router | Routing type-safe |
| TanStack Query | Server state + cache |
| Zod | Validación de formularios (schemas desde `shared`) |

### `apps/server` — Backend API (Cloudflare Worker)
| Herramienta | Propósito |
|---|---|
| Cloudflare Workers (`nodejs_compat`) | Runtime. Un Worker enruta por subdominio; el trabajo ocurre dentro de Durable Objects |
| Durable Objects con SQLite (`TenantDO`, `PlatformDO`) | Un DO por negocio y uno para la plataforma; cada uno con su SQLite |
| Hono | Framework HTTP (una app por tipo de DO: `tenant-app.ts`, `platform-app.ts`) |
| drizzle-orm `durable-sqlite` (0.44) | Schema y queries type-safe sobre el SQLite del DO (API síncrona) |
| `argon2id` (WebAssembly) | Hash de contraseñas, PIN, recovery y códigos de activación |
| wrangler 4 | Desarrollo local (`wrangler dev`), despliegue y secretos |
| zod | Validación de requests |
| vitest + `@cloudflare/vitest-plugin` | Tests dentro de `workerd` con Durable Objects reales |

### Impresión de tickets — vía navegador
> Los tickets de 80mm (ventas) y las cotizaciones se imprimen con `window.print()` desde la SPA: un overlay renderizado vía React Portal + `@page { size: 80mm auto }` inyectado dinámicamente. **No hay servicio local ni `apps/print-bridge`** — el print-bridge WebSocket original (ESC/POS sobre `apps/print-bridge` + módulo `/ws/print`) se eliminó el 2026-06-12 por ser demasiado frágil para un solo usuario. La impresora objetivo (Epson TM-T20II) se configura como predeterminada en Windows; el navegador maneja la codificación.

### `packages/shared` — Contrato común
| Contenido | Propósito |
|---|---|
| `schemas/` | DTOs zod usados por frontend Y backend |
| `money.ts` | Manejo de ₡ como INTEGER — único punto de formateo |

### Infraestructura
| Componente | Herramienta |
|---|---|
| Cómputo | Cloudflare Workers (plan Workers Paid, $5/mes) · Worker `dosuxsoft` con ruta `*.dosuxsoft.com/*` |
| Base de datos | Durable Objects con SQLite: uno por negocio (`TenantDO`, `idFromName(slug)`) y uno de plataforma (`PlatformDO`, `idFromName('platform-enam')`), todos pedidos con `locationHint: 'enam'` (este de Norteamérica) |
| Frontend | Static Assets del mismo Worker (`apps/web/dist`, SPA) · headers en `apps/web/public/_headers` |
| Tareas programadas | Cron Triggers (tipo de cambio y mantenimiento diario) + alarma por negocio (cierre automático de caja) |
| Respaldo | Point-in-Time Recovery de cada DO (30 días) + exportación JSON diaria a R2 (`dosuxsoft-backups`, regla de vida de 30 días) + descarga JSON del dueño |
| HTTPS | Universal SSL de Cloudflare cubre `*.dosuxsoft.com` (registro DNS `*` Proxied → `AAAA 100::`) |
| Logs | Workers Observability (`wrangler tail` para verlos en vivo) |

> Ya no hay VPS, Docker, Caddy, Fastify, `better-sqlite3`, `node-cron` ni scripts por SSH (eliminados en la Fase G).

---

## 4. Arquitectura

```
[Navegador — SPA React en taller.dosuxsoft.com] ──window.print()──► Ticketera 80mm
        │ HTTPS (Universal SSL de Cloudflare)
        ▼
   Worker "dosuxsoft" (worker.ts): Host → destino
        │  páginas y /assets ◄── Static Assets (apps/web/dist)
        │  /api /auth /platform /internal /health
        ├── Host = admin.*   ──► PlatformDO ("platform")   SQLite: negocios, suscripción, superadmins,
        │                          Hono: /platform/*, /internal/ops, /health        pagos, tipo de cambio, bitácora
        └── Host = <slug>.*  ──► TenantDO (<slug>)          SQLite: TODOS los datos de ese negocio
                                   Hono: /auth/*, /api/*        alarma: cierre automático de caja
   Cron Triggers ──► Worker.scheduled ──► PlatformDO (tipo de cambio) / cada TenantDO (mantenimiento) ──► R2
```

### Aislamiento multi-negocio (Fase A, reescrito en la Fase G)
- **Un Durable Object por negocio.** Sesiones, usuarios, audit_log y datos viven en el SQLite de su DO. Un token de sesión de un negocio no existe en el DO de otro.
- El negocio se resuelve **solo en el servidor**, desde el `Host` (`routeHost` en `worker.ts`): el primer label debe ser un slug válido (`isValidSlug`, regex de label DNS y subdominios reservados), `admin` es el panel. Un host inválido se rechaza en el Worker sin tocar ningún DO. Con un slug válido el Worker va **directo al `TenantDO`** (sin preguntarle a la plataforma ni caché): el DO responde 404 `NEGOCIO_NO_ENCONTRADO` si nunca se inicializó (sin crear tablas ni kv) y 403 `NEGOCIO_SUSPENDIDO` si su kv `status` es `suspended` (sin la clave = activo, p. ej. negocios creados antes de guardarla). El estado lo escribe la plataforma: `initialize`, `setStatus` y la reconciliación del cron diario.
- La petición HTTP se atiende **dentro del DO** (el Worker solo reenvía): services y repositories siguen síncronos. El Worker borra cualquier `X-Dosuxsoft-Tenant` que mande el cliente y fija el suyo.
- `db` (de `db/client.ts`) es un proxy al negocio del contexto actual (`AsyncLocalStorage`, `runInTenant`). **Falla cerrado:** usarlo fuera de un negocio lanza error. Igual `controlDb` (`db/control.ts`) con `runInPlatform`: el código de un negocio nunca puede leer las tablas de la plataforma.
- Subdominios reservados: `www`, `api`, `app`, `admin`, `mail`, `static`, `assets`, `control`.
- La cookie de sesión no lleva `Domain` → queda atada a su subdominio.
- Rate limit por negocio + IP (en el DO del negocio; ver §6.4).
- **Solo con `ENVIRONMENT=development`** el Worker toma el negocio de `X-Forwarded-Host` (y solo si la URL es local); en producción lo ignora. Test en `routing.test.ts`.
- Tests de aislamiento: `apps/server/src/tests/tenancy.test.ts` y `routing.test.ts` — **deben pasar siempre**.

### Comunicación entre Durable Objects (RPC)
- Los stubs salen **siempre** de `lib/platform-client.ts`: `platform(env)` y `tenantStub(env, slug)` (con `locationHint: 'enam'`; la pista solo cuenta al crear el objeto, los existentes no se mueven). Nunca `env.TENANT/PLATFORM.idFromName` sueltos.
- La plataforma vive en el objeto `platform-enam`. El original (`platform`, nació en Singapur) solo se lee una vez: al arrancar, si el kv no tiene `migrated-from-legacy` y no hay superadmins ni negocios, el nuevo pide `exportLegacyControl()` y copia en una transacción `superadmins`, `tenants`, `subscription_payments`, `platform_settings`, `platform_audit_log` y `exchange_rates` (con ids; sin sesiones), marca el kv y avisa su estado a cada negocio (`setStatus`). **Falla cerrado:** si el objeto viejo no responde en 10 s o la copia falla, lanza dentro de `blockConcurrencyWhile` sin marcar; el objeto se reinicia sin atender ni escribir nada y la próxima petición reintenta (`db/legacy-platform.ts`). `platform_settings` y `exchange_rates` se copian con `INSERT OR IGNORE`; el resto, estricto. Tras `restore-tenant`, la consola vuelve a avisarle su estado al negocio (`statusSynced`).
- `PlatformDO.consumeSetupCode(slug, code)`, `subscriptionInfo(slug)`, `latestExchangeRate()`, `listMaintainedTenants()`, `exportLegacyControl()`.
- `TenantDO.platformSummary()` (activado, tipo, módulos, usuarios, última venta), `assignBusiness(input)`, `initialize(slug, assignment, status)`, `setStatus(status)`, `exportSnapshot()`, `dailyMaintenance(status)`, `bookmarks()`, `restoreToBookmark(bookmark)`.
- Suspender/reactivar (panel y `pnpm ops`): primero `TenantDO.setStatus` (5 s de límite) y después `control.db`; si el negocio no responde → 503 `NEGOCIO_NO_DISPONIBLE` y la plataforma no cambia. Rige de inmediato.
- El panel solo lee métricas de uso de un negocio por RPC; nunca clientes ni montos. Si el DO de un negocio falla o tarda más de 5 s, el panel lo muestra como "No disponible" (sin uso, y sin poder cambiar tipo, módulos ni emitir código) y sigue funcionando.

### Panel de la plataforma (Fase F, adaptado en la Fase G)
- `admin.<dominio>` (`PLATFORM_SUBDOMAIN`, reservado como slug) es el panel de superadministrador. Misma SPA: `main.tsx` carga `features/platform/PlatformApp` (lazy) según el Host.
- En el Worker: desde `admin.` **solo** se reenvían `/platform/*`, `/internal/ops` y `/health` (el health check existe únicamente en este host) y nunca se entra al contexto de un negocio; desde cualquier otro subdominio `/platform/*` e `/internal/*` dan 404. `requirePlatformAuth` lo vuelve a comprobar.
- Test: `apps/server/src/tests/platform.test.ts` — **debe pasar siempre** (aislamiento del panel, bloqueo, pagos, suspensión, negocio caído).

### Principio de módulos
Cada módulo de negocio sigue el patrón:
```
web/src/features/<modulo>/          # página(s) + componentes propios + api.ts
server/src/modules/<modulo>/        # routes.ts + service.ts + repository.ts
packages/shared/schemas/<modulo>.ts # DTOs zod compartidos
```
Agregar un módulo nuevo = crear esas carpetas. **Nada existente se modifica.**

---

## 5. Diseño Visual

### Paleta de colores
| Nombre | Hex | Uso |
|---|---|---|
| Azul de marca | `#0A2947` | Barra lateral, barra superior en celular, panel del inicio de sesión y del panel de admin (`--color-brand-navy`; antes `#1E3A5F` y, por unos días, `#0758D6`) |
| Azul medio | `#2563EB` | Acciones interactivas, links, focus |
| Azul claro | `#DBEAFE` | Fondos de tarjetas en light mode, badges |
| Blanco | `#FFFFFF` | Fondo principal light mode, texto en dark |
| Gris claro | `#F1F5F9` | Fondos secundarios light |
| Gris oscuro | `#0F172A` | Fondo principal dark mode |
| Éxito | `#16A34A` | Confirmaciones, ventas completadas |
| Error | `#DC2626` | Errores, alertas críticas |
| Advertencia | `#D97706` | Advertencias, estados pendientes |

### Diseño responsivo (mobile-first)
- La app debe ser completamente usable desde el celular del dueño (búsqueda de boletas, consulta de clientes, reportes).
- Layout adaptativo: sidebar en desktop → menú hamburguesa / bottom navigation en mobile.
- Todos los módulos de consulta (boletas, clientes, reportes, historial de caja) deben funcionar correctamente en pantalla de 390px de ancho.
- Formularios de captura (POS, gastos) son secundarios en mobile — priorizamos lectura/consulta.
- Touch targets mínimos de 44×44px (directriz Apple HIG).
- Breakpoints Tailwind: `sm` (640px) como umbral principal desktop/mobile.

### Dark mode
- Estrategia: `class` de Tailwind (`dark:` prefix).
- Toggle persistente en `localStorage`.
- Respeta `prefers-color-scheme` del sistema en primera visita.

### Branding
| Archivo fuente | Uso en la app |
|---|---|
| `BRAND/*.jpg` (monograma DS) | Fuente del logo · `web/public/logo.png` (blanco sobre transparente) se usa en sidebar, panel y como favicon |
| `web/public/og-image.png` | Open Graph (1200×630): monograma DS sobre azul ejecutivo |

### Tipografía
- Fuente: `Inter` (Google Fonts o bundleada con Fontsource).
- Tamaños: escala de Tailwind estándar (base 16px).

### Íconos
- Biblioteca: **Lucide React** — minimalista, consistente, tree-shakeable.
- Siempre invocar `/ui-ux-pro-max` antes de seleccionar íconos nuevos.

---

## 6. Seguridad — Decisiones Cerradas

### 6.1 Autenticación
| Decisión | Valor |
|---|---|
| Hash de contraseñas | `argon2id` en WebAssembly con `m=19456 KiB, t=2, p=1` (mínimo OWASP; cabe en los 128 MB de un isolate). Si un login válido trae un hash con otros parámetros, se vuelve a guardar con los vigentes (rehash) |
| Sesión — duración absoluta | **8 horas** |
| Sesión — timeout de inactividad | **60 minutos** |
| Almacenamiento de sesión | Cookie `HttpOnly` + `Secure` + `SameSite=Strict` · tabla `sessions` en BD |
| Al cambiar contraseña/PIN o desactivar | Invalidar **todas** las filas de `sessions` de ese usuario (`revokeUserSessions`) |
| Login | Usuario + contraseña (dueño/admin) o usuario + PIN de 6 dígitos (cajero). 5 fallos → bloqueo de 15 min por usuario (además del rate limit por IP). Usuario inexistente = mismo tiempo y mensaje que contraseña incorrecta |
| Recovery code | Generado con `crypto.randomBytes(16).toString('hex')` · mostrado UNA vez · almacenado hasheado con argon2id · invalidado al usarse (genera uno nuevo) |
| Código de activación (Fase A) | `/auth/setup` exige un código de un solo uso emitido al crear el negocio desde el panel (o con `pnpm ops tenant-create` / `setup-code`; 64 bits, `XXXX-XXXX-XXXX-XXXX`, argon2id en `PlatformDO`, se borra al usarse). Sin código vigente el setup queda cerrado. Evita que un tercero reclame un negocio recién creado (los subdominios son adivinables y aparecen en los logs públicos de Certificate Transparency). |

### 6.2 Impresión de tickets (sin token de bridge)
- La impresión ocurre **100% en el navegador** vía `window.print()` — no hay servicio externo, WebSocket ni token que proteger.
- *(Histórico: existió un print-bridge WebSocket con token argon2id de 256 bits; se eliminó el 2026-06-12 junto con su superficie de seguridad.)*

### 6.3 Endpoint de descarga de backup
- `GET /api/settings/backup/download`: solo el **dueño**, con sesión activa verificada **server-side**.
- Entrega una **exportación JSON** de todas las tablas del negocio (`dosuxsoft-<slug>-<fecha>.json`), generada al pedirla; **excluye `sessions`** y `__migrations`. No hay archivo `.db` que descargar.
- Contiene datos confidenciales: hashes de usuarios y contraseñas de equipos de clientes en texto plano. La pantalla de Configuración lo avisa; guardarlo en un lugar seguro.
- El slug sale del negocio resuelto por el Host; el endpoint **nunca** acepta parámetros del cliente para elegir qué exportar (un negocio no puede descargar el de otro).
- Respuesta con `Content-Disposition: attachment` — nunca inline. Queda en el `audit_log` (`BACKUP_DOWNLOADED`).
- Es un GET con efectos (bitácora y cupo): `sameOriginOnly` lo rechaza con 403 `ORIGEN_NO_PERMITIDO` si viene de otro origen (misma regla que `sameOriginWrites`).
- Rate limit: máximo **5 descargas por hora** por sesión.
- La copia diaria automática de cada negocio y de la plataforma va a R2 con el mismo formato (ver §3 Infraestructura).

### 6.4 Rate limiting
Por **negocio + IP**; la IP sale de `CF-Connecting-IP`. El límite general vive **en memoria** de la instancia del DO (`memoryRateLimit`, ventana fija, máximo 10 000 claves): solo frena ráfagas y no merece una escritura durable por petición; se reinicia si el DO se reinicia. Los demás (login, recover, setup, cambio de secreto, backup, ops) viven en el `kv` síncrono del DO (`ctx.storage.kv`) y sobreviven a reinicios; el mantenimiento diario borra los vencidos.

La última actividad de una sesión (negocio y panel) se escribe a lo sumo una vez por minuto (`shouldTouch`): el vencimiento por inactividad (60 min) puede adelantarse hasta un minuto.

| Endpoint | Límite |
|---|---|
| General de la API | 200 por minuto por IP (en memoria) |
| `POST /auth/login` | 5 intentos por IP cada 15 minutos |
| `POST /auth/recover` | 3 intentos por IP cada 30 minutos |
| `GET /api/settings/backup/download` | 5 descargas por hora por sesión |
| `POST /internal/ops` | 10 intentos **fallidos** por IP cada 15 minutos (los válidos no cuentan; con 10 fallos acumulados responde 429 aunque el token sea correcto) |

Opcional: una regla de WAF de Cloudflare (rate limiting) sobre `/api/*` y `/auth/*` como defensa adicional.

### 6.5 CORS y CSRF
- **Sin CORS.** Cada negocio y el panel llaman a su API en su mismo origen (el Worker en producción, el proxy de Vite en desarrollo). Habilitarlo permitiría a otro subdominio de `dosuxsoft.com` leer la API con sesión: es el mismo sitio, así que las cookies `SameSite=Strict` viajan. (Hasta la revisión de 2026-10-07 se autorizaba `www.dosuxsoft.com`.)
- **Protección CSRF (Fase G):** el middleware `sameOriginWrites` (`lib/http.ts`) se aplica a todo método que no sea GET/HEAD/OPTIONS en `tenant-app.ts` y `platform-app.ts`. Rechaza con 403 `ORIGEN_NO_PERMITIDO` si `Sec-Fetch-Site` no es `same-origin` o si el host de `Origin` no es el que usó el Worker para enrutar (header interno `X-Dosuxsoft-Host`), y con 415 `TIPO_NO_SOPORTADO` si hay cuerpo y el `Content-Type` no es `application/json`. Un cliente sin navegador (la consola de operaciones) no manda `Origin` y pasa. Test: `csrf.test.ts`.

### 6.6 Headers de seguridad HTTP
Para las páginas y archivos estáticos, en `apps/web/public/_headers` (Static Assets). Las respuestas de la API (Worker y DO) llevan los mismos, salvo el CSP, más `Cache-Control: no-store`.
```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'
```
- `/assets/*` se sirve con `Cache-Control: public, max-age=31536000, immutable`.
- Todos los endpoints de la API responden con `Cache-Control: no-store`.

### 6.7 Soft deletes
- Tablas `sales` y `expenses`: columna `deleted_at DATETIME NULL`.
- Los registros financieros **nunca se borran permanentemente** — solo se marca `deleted_at`.
- Las consultas normales filtran `WHERE deleted_at IS NULL`.

### 6.8 Audit log
- Tabla `audit_log` desde **Fase 1**.
- Registra: ventas creadas/eliminadas, aperturas/cierres de caja, gastos, cambios en configuración, backups descargados, sesiones iniciadas/cerradas.
- Campos: `id, action, entity_type, entity_id, payload_snapshot JSON, ip, user_agent, created_at`.
- **Solo inserción** — nunca se modifica ni elimina.

### 6.9 Validación de datos
- Zod valida **forma, tipo, tamaño y rango** en cada endpoint antes del service layer.
- Montos: solo `INTEGER` ≥ 0. Rechazar cualquier valor no entero.
- Celular cliente: 8 dígitos (Costa Rica).
- IMEI: 15 dígitos numéricos, validación con algoritmo de Luhn.
- Campos de texto: límites máximos definidos (descripción venta: 500 chars, notas: 5000 chars, etc.).

### 6.10 Manejo de errores
- Errores internos → loguear con `console.error` (Workers Observability) → responder al cliente con mensaje genérico `{ error: { code, message } }`.
- **Nunca** stack traces ni detalles internos en respuestas al cliente (CWE-209).
- Errores tipados del dominio en `server/src/lib/errors.ts` (ej. `CajaYaAbierta`, `UsuarioBloqueado`).

### 6.11 Observabilidad
- Logs con `console.*` en el Worker y los DO; Workers Observability está activada (`observability.enabled`). En vivo: `pnpm --filter @dosuxsoft/server exec wrangler tail`.
- Health check: `GET /health` **solo en `admin.dosuxsoft.com`** → estado de la plataforma, entorno y hora. Desde un negocio no existe.
- Sin Sentry (decisión del usuario) — los logs de Workers son la fuente de diagnóstico.

### 6.12 Break-glass (recuperación de emergencia)
- **Riesgo aceptado:** un solo dueño por negocio + recovery code significa que si se pierden ambos hay que usar la consola de operaciones; sin reset por email.
- **Mitigación (cambia en la Fase G, aprobado por el usuario el 2026-10-10):** en Workers no hay SSH ni scripts locales. Las operaciones de emergencia son el endpoint `POST /internal/ops` de `PlatformDO` (solo desde `admin.`), protegido por el secreto `OPS_TOKEN` (256 bits, `openssl rand -hex 32`, `wrangler secret put OPS_TOKEN`; con menos de 32 caracteres el endpoint queda apagado y responde 404). El token va en `Authorization: Bearer`, se compara en tiempo constante, y cada llamada (también las rechazadas) queda en `platform_audit_log` como `OPS_<COMANDO>` sin guardar contraseñas ni códigos. El secreto cumple el papel que tenía la llave SSH: quien lo tiene administra la plataforma.
- **CLI local:** `pnpm ops <comando> [clave=valor …] [--url <base>]` (`apps/server/scripts/ops.ts`), con `OPS_TOKEN` en el entorno (nunca como argumento). Por defecto llama a `https://admin.dosuxsoft.com`; solo acepta `http` hacia localhost.
- **Comandos:** `superadmin-create`, `superadmin-reset`, `superadmin-disable`, `superadmin-enable`, `superadmin-list` (los cuatro primeros con `username=`), `tenant-list`, `tenant-create slug= name=`, `tenant-suspend`, `tenant-activate`, `setup-code`, `reset-owner` (los cuatro con `slug=`; `reset-owner` restablece al dueño, imprime contraseña temporal y nuevo recovery code, y cierra sus sesiones), `bookmarks slug=` y `restore-tenant slug= bookmark=`.
- **Restaurar un negocio:** `bookmarks` lista el bookmark actual y los `pre-migracion:<tag>`; `restore-tenant` programa la restauración PITR y reinicia el DO (devuelve un `undoBookmark` para deshacerla). PITR no existe en el runtime local; en producción se probó con éxito el 2026-10-11 con un negocio desechable (`restore-tenant` respondió `restored: true` y el negocio volvió a responder).
- **Eliminar un negocio:** `tenant-delete slug=` (solo por consola, el panel no lo ofrece). Solo si está **suspendido** (si no, 409 `NEGOCIO_NO_SUSPENDIDO`); es **irreversible**: vacía su DO (`destroy()`: alarma + `deleteAll()`) y después borra su fila de `tenants` y sus `subscription_payments` (el subdominio queda libre); si el DO falla no se toca la plataforma. Las copias en R2 quedan hasta que vencen (30 días); la bitácora guarda `OPS_TENANT_DELETE` con subdominio y nombre.
- Administración normal de negocios: desde el panel `admin.<dominio>`.

### 6.13 Roles y permisos (Fase B)
| Acción | Dueño | Admin | Cajero |
|---|---|---|---|
| Vender, caja, gastos, boletas, clientes, cotizaciones, abonos, reportes | ✅ | ✅ | ✅ |
| Eliminar ventas/gastos | ✅ | ✅ | Solo con **autorización en el momento** de un admin/dueño |
| Cancelar créditos/apartados, anular facturas | ✅ | ✅ | ❌ |
| Gestionar usuarios | Admins y cajeros | Solo cajeros | ❌ |
| Inventario: crear/editar productos, precios, entradas y ajustes; ver costos | ✅ | ✅ | ❌ (consulta precio y stock) |
| Editar configuración, descargar backups | ✅ | ❌ | ❌ |

- Matriz en `packages/shared/src/schemas/auth.ts` (`PERMISSIONS`, `can`, `manageableRoles`). El frontend la usa solo para mostrar/ocultar; **el servidor la hace cumplir** con `requireRole(...)` (rutas) y `authorizeOrEscalate(request, permiso)` (acciones escalables).
- **Autorización de supervisor:** el cajero envía `body.authorization = { username, secret }` de un admin/dueño junto con la acción. Se valida con el mismo `verifyCredentials` del login (cuenta intentos fallidos y bloquea), no abre sesión, y queda en el `payload_snapshot` como `authorizedBy`. Los intentos fallidos se registran como `SUPERVISOR_AUTH_FAILED`.
- **Autor en audit_log:** columna `user_id`, rellenada con `currentActorId()` (el actor que `requireAuth` deja en el contexto del request). NULL = sistema o sin sesión. Toda inserción nueva en `audit_log` debe incluir `userId: currentActorId()`.
- Un solo dueño por negocio (índice único parcial).
- Usuarios nunca se borran: se desactivan. El rol no se cambia (contraseña vs PIN): se desactiva y se crea otro.
- **Revisar unicidad después de cada `await`:** entre una verificación ("¿existe ya?") y la inserción no puede haber `await` (hash argon2). Calcular los hashes primero y luego verificar e insertar sin pausas; el SQLite del Durable Object es síncrono y de un solo hilo, así que ese tramo es atómico (setup del dueño, alta de usuarios, alta de negocios).
- El recovery code es solo del dueño; admins y cajeros los restablece un superior desde Usuarios.

### 6.14 Panel de la plataforma (Fase F)
| Decisión | Valor |
|---|---|
| Cuentas | Tabla `superadmins` en `PlatformDO`, argon2id, creadas solo con la consola de operaciones (`pnpm ops superadmin-create`); no hay alta ni recuperación por el panel |
| Sesión | Cookie `dosuxsoft_platform` (distinta a la de los negocios, sin `Domain` → solo `admin.`), tabla `platform_sessions` (se excluye del respaldo), mismas 8 h / 60 min |
| Login | 5 fallos → bloqueo 15 min por cuenta + rate limit 5/15 min por IP; usuario inexistente = mismo tiempo y mensaje |
| Cambio de contraseña | Cierra todas las sesiones de esa cuenta y abre una nueva para quien la cambió |
| Bitácora | `platform_audit_log` (solo inserción): login, alta, cambios con valor anterior y nuevo, pagos, anulaciones, suspensiones |
| Datos de un negocio | El panel lee métricas de uso (cantidad de usuarios, fecha de la última venta) y el tipo de negocio y los módulos. Lo único que escribe en la BD de un negocio es esa asignación (`business_profile`). Nunca clientes ni montos |
| Sin MFA | Igual que el resto del sistema (§10). Mitigación: cuentas solo por la consola de operaciones (`OPS_TOKEN`), bloqueo, bitácora |

---

## 7. Convenciones de Código

### Nomenclatura
| Contexto | Convención | Ejemplo |
|---|---|---|
| Archivos de componentes | PascalCase | `SaleForm.tsx` |
| Archivos de lógica/utils | camelCase | `apiClient.ts` |
| Carpetas | kebab-case | `cash-register/` |
| Variables y funciones | camelCase | `openCashRegister()` |
| Tipos e interfaces | PascalCase | `SaleRecord` |
| Constantes globales | SCREAMING_SNAKE_CASE | `MAX_LOGIN_ATTEMPTS` |
| Tablas de BD | snake_case | `cash_registers` |
| Columnas de BD | snake_case | `created_at` |

### Formato y lint
- Antes de cada commit: `pnpm lint` y `pnpm format:check` sin errores (Prettier con `.prettierrc`; `.md` y migraciones excluidos en `.prettierignore`).

### Comentarios
- Solo cuando el **POR QUÉ** no es obvio (restricción oculta, invariante sutil, workaround).
- No documentar QUÉ hace el código — los nombres lo hacen.
- No referencias a tareas, issues o PRs en el código.

### Estructura de un módulo backend
```typescript
// routes.ts  — solo define rutas y llama al service
// service.ts — lógica de negocio, sin tocar la BD directamente
// repository.ts — queries Drizzle, sin lógica de negocio
```

### Reglas de dinero
- Los montos viajan como `number` (enteros) en toda la app.
- El único lugar que formatea a `₡12 500` es `packages/shared/money.ts`.
- **Nunca** `parseFloat` o división/multiplicación de montos en el servidor.

### Reglas de fecha y hora
- **Todos los timestamps se almacenan en UTC** en la BD.
- **Fijar `createdAt`/`updatedAt` explícitamente con `new Date().toISOString()`** en cada inserción que se muestre en pantalla. El default `datetime('now')` de SQLite guarda UTC *sin* `Z` (`2026-10-07 19:52:52`) y el navegador lo interpreta como hora local: 6 h de error en Costa Rica (bug encontrado en Fase C en `stock_movements`).
- **Todos los límites de día/semana/mes** (reportes, "ventas de hoy" por fecha) y la **alarma de cierre automático** se computan en `America/Costa_Rica`.
- El corte de caja agrupa ventas por `cash_register_id` (FK), **no por fecha** — inmune al problema de zona horaria.
- Workers y Durable Objects corren en UTC; la conversión a hora de CR ocurre en la capa de lógica (`lib/cr-time.ts`), nunca se asume la TZ del entorno.

### Transacciones SQLite
- Toda operación que toca más de una tabla debe usar `db.transaction()` (síncrona: dentro no puede haber `await`). En la plataforma, `controlTransaction`.
- Especialmente: crear venta + incrementar consecutivo, crear cierre + snapshot.

### Restricción de caja única abierta
- SQLite no soporta índices parciales (`WHERE`) via Drizzle ORM — no es posible un `UNIQUE INDEX ... WHERE closed_at IS NULL`.
- La invariante "solo una caja abierta" se garantiza en el **service layer** de Fase 4: `POST /api/cash-registers/open` consulta si existe una fila con `closed_at IS NULL` dentro de una transacción antes de insertar. SQLite es single-writer — no hay race condition real en este modelo.

### Reglas multi-negocio (Fase A, reescritas en la Fase G)
- Los repositories importan `db` desde `db/client.ts` como siempre — **nunca** guardar una referencia a la BD de un negocio en una variable de módulo ni abrir otro DO desde código de un negocio.
- **No existen `forEachActiveTenant` ni `runWithTenant`.** El contexto de un negocio se abre con `runInTenant(ctx, fn)` (lo hace `TenantDO`: en cada request, en la alarma y en los métodos RPC) y el de la plataforma con `runInPlatform(storage, fn)` (`PlatformDO`). `controlDb` usado fuera de `runInPlatform` lanza error, igual que `db` fuera de un negocio.
- **Jobs → crons y alarmas.** Los Cron Triggers (`15 * * * *` y `0 9 * * *`, definidos en `wrangler.jsonc`) llaman desde `worker.ts` (`scheduled`) a métodos RPC: `PlatformDO.refreshExchangeRate()` y, por cada negocio activo o suspendido (`listMaintainedTenants`, con `Promise.allSettled` para que uno caído no frene a los demás), `TenantDO.dailyMaintenance(status)` (reconcilia su estado con el de `control.db`, limpieza de sesiones y contadores, exportación a R2; en un DO nunca inicializado no hace nada). El cierre automático de caja usa una alarma por negocio (`scheduleAutoClose`, que se reprograma al guardar la configuración y al despertar el DO).
- **Rutas sin negocio:** solo `/health` (únicamente en `admin.`; en el host de un negocio el Worker responde 404 sin tocar su DO); se enrutan en `worker.ts`.
- **Errores entre DO:** un error lanzado dentro de un método RPC cruza solo con su mensaje, así que un `AppError` pierde `code` y `status`. Los métodos RPC devuelven resultados explícitos o el llamador traduce el fallo (por ejemplo `NegocioNoDisponible`, 503).
- El registro de negocios y lo de la plataforma (suscripción, pagos de la mensualidad, superadministradores, tipo de cambio) vive en `PlatformDO`. **Nunca** datos operativos de un negocio.
- Tests: con `@cloudflare/vitest-plugin` (`runInDurableObject`, `SELF.fetch`); los helpers están en `src/tests/helpers.ts` (`createTestTenant` también registra el negocio en `PlatformDO`).

### Reglas de inventario (Fase C)
- `products.stock` es el saldo de `stock_movements`. **Solo** `applyStockChange(tx, …)` (`modules/products/repository.ts`) lo modifica, siempre dentro de la transacción del llamador y dejando el movimiento con `stock_after`.
- Venta con carrito: el cliente envía `{ productId, quantity }`; **precio y costo salen del catálogo en el servidor** y se copian a `sale_items` (cambiar el precio después no altera ventas pasadas). Líneas libres: `{ description, quantity, unitPrice }`.
- `sales.amount` y `sales.description` se siguen llenando (total y resumen "2× X, Y"): caja, reportes y dashboard no leen `sale_items`.
- Vender sin stock se permite (stock negativo) y se devuelve en `stockWarnings`. Eliminar una venta devuelve el stock (`anulacion_venta`).
- El costo solo se envía a roles con `viewCosts`; el cajero recibe `cost: null`.

### Reglas de perfil del negocio (Fase D)
- `business_profile` (una fila) define plantilla, nombre de las órdenes (`ordersLabel`), qué se recibe (`itemLabel`), campos de la orden y módulos activos. Plantillas en `packages/shared/src/schemas/business.ts` (`TEMPLATE_INFO`).
- **Tipo de negocio y módulos los asigna la plataforma** (decisión del usuario, 2026-10-08): al crear el negocio en el panel y después con `PUT /platform/tenants/:slug/business` (`assignBusinessSchema`, `assignBusiness` en `modules/business/service.ts`). El dueño solo los ve: `PUT /api/business` acepta `ownerProfileSchema` (nombres y campos) y conserva tipo y módulos aunque lleguen en el body. El setup del dueño ya no elige tipo. `pnpm ops tenant-create` asigna "Otro tipo de negocio".
- Cambiar el tipo reemplaza nombres y campos por los de la plantilla (`applyAssignment`); mismo tipo, solo cambian los módulos.
- **Módulos activables** (`ordenes`, `cotizaciones`, `facturas`, `apartados`, `creditos`, `inventario`): se registran con `registerModuleRoutes` (`middleware/module.ts`) → 404 `MODULO_DESACTIVADO` si están apagados. En el frontend: `requireModule` en `beforeLoad` y `module` en `NAV_ITEMS`. Un módulo nuevo activable debe hacer las tres cosas.
- **Campos de la orden:** `boletas.fields` es JSON `OrderFieldValue[]` con la **etiqueta copiada al crear** la orden: renombrar o borrar un campo no altera órdenes viejas. La clave (`key`) es estable y no cambia al renombrar.
- Validación con `validateOrderFields` (compartida): el frontend la usa para mostrar errores y el servidor para rechazar. Claves fuera del perfil se ignoran.
- Campos tipo `secret` (contraseña del equipo del cliente) van en texto plano, como siempre; **nunca** se copian al `audit_log`.
- El perfil vive en el contexto del router (`useBusiness`); tras guardarlo, `router.invalidate()`.

### Reglas de dólares y avisos (Fase E)
- **Contabilidad en colones.** Los dólares solo se *reciben* (método de pago `dolares`): la venta guarda `amount` en ₡ más `usd_received_cents`, `exchange_rate` (centésimas de ₡) y `change_colones`. El vuelto siempre es en colones.
- Enteros en todo: USD en centavos, tipo de cambio en centésimas. Conversión solo con `usdCentsToColones` (`packages/shared/src/money.ts`). El único decimal→entero es al leer el BCCR (`lib/bccr.ts`).
- **El tipo de cambio lo decide el servidor** al cobrar (`getExchangeRateInfo`, `lib/exchange-rate.ts`): compra BCCR (317) si es de los últimos 4 días; si no, el de respaldo `usd_manual_rate` del negocio; si no hay, 400 `TIPO_CAMBIO_NO_DISPONIBLE`.
- BCCR: API SDDE (`apim.bccr.fi.cr`, token Bearer en `BCCR_API_TOKEN`, uno para toda la plataforma). Tabla `exchange_rates` en `PlatformDO` (global). Cron horario (`15 * * * *`), no por negocio.
- **Avisos por WhatsApp:** enlaces `wa.me/506XXXXXXXX?text=…` (`whatsappLink`), la persona toca Enviar. Plantillas en settings `msg_*` (vacío = `DEFAULT_MESSAGES`). Cada aviso abierto queda en `customer_notifications` (solo inserción). No hay envío automático.

### Reglas de la plataforma (Fase F)
- **Alta solo desde el panel** (o `pnpm ops tenant-create`): no hay registro público.
- **Cobro manual:** el superadministrador registra cada pago (SINPE / transferencia). `tenants.paid_until` es el último día cubierto (YYYY-MM-DD, calendario de CR); NULL = sin cobro. Un pago extiende **desde el vencimiento actual aunque ya pasó** (`addMonths`, compartido). Los pagos no se borran: se anulan, y anular el último pago devuelve el vencimiento (`previous_paid_until`) si nadie lo corrigió después.
- **Un atraso nunca bloquea.** Estado derivado con `subscriptionStatus` (compartido): `al_dia`, `por_vencer` (≤ 5 días), `vencido`, `sin_cobro`. El dueño y los admins ven un aviso; suspender es manual desde el panel.
- Precio: `monthly_price` del negocio o, si es NULL, `default_monthly_price` de `platform_settings`.
- Las tablas de la plataforma (`db/control.ts`, en `PlatformDO`) se crean con `CREATE TABLE IF NOT EXISTS` y columnas nuevas con `ALTER TABLE` condicional en `db/control.ts` (no usa las migraciones de Drizzle). Todo lo que escribe más de una tabla usa `controlTransaction`.
- El enrutado del panel en el frontend es un enrutador mínimo propio (`features/platform/router.tsx`), para no mezclar un segundo árbol de TanStack Router con los tipos de la app de los negocios.

### Regla de migraciones
- Cada `TenantDO` aplica las migraciones pendientes al arrancar, dentro de `blockConcurrencyWhile` (`db/migrator.ts`): un runner propio sobre el journal, cada archivo en su propia transacción y registrado en `__migrations`. Si una migración falla, el DO no arranca hasta que se despliegue la corrección.
- Antes de migrar un negocio **con datos**, el runner guarda el bookmark de PITR en el kv del DO como `pre-migracion:<tag>` (reemplaza la copia `pre-migracion-*.db` del VPS). `pnpm ops bookmarks slug=<slug>` lo lista; `restore-tenant` vuelve a él. Si una migración sale mal: **primero desplegar la corrección y después restaurar**, porque el DO volvería a intentar la migración.
- Migraciones a mano (no hay `drizzle-kit`): crear el `.sql` en `apps/server/src/db/migrations/`, agregarlo al `_journal.json` con `when` **mayor que la anterior** y agregar su `import` y su entrada al final de la lista `MIGRATIONS` en `src/db/migrations.ts`. Un archivo sin esa entrada nunca se aplica.
- Tests: `src/tests/migrations.test.ts` (incluye subir una BD en el estado anterior hasta la última).

### Regla de alias en subqueries Drizzle ORM
- Los campos `sql<T>\`...\`` dentro de un subquery nombrado (`.as('subqueryName')`) **deben** tener su propio `.as('fieldAlias')` o Drizzle v0.36+ lanza en runtime:
  `"You tried to reference 'field' from a subquery, which is a raw SQL field, but it doesn't have an alias declared."`
- **Correcto:**
  ```typescript
  const sub = db.select({
    id: table.id,
    total: sql<number>`COALESCE(SUM(${table.amount}), 0)`.as('total'), // ← alias obligatorio
  }).from(table).groupBy(table.id).as('sub');
  ```
- El error ocurre en tiempo de ejecución (no en `tsc`), por lo que solo se manifiesta al hacer la primera query en producción.

---

## 8. Variables de Entorno

No hay archivo `.env` de producción. Las variables no secretas están en `apps/server/wrangler.jsonc`; los secretos se guardan en Cloudflare con `wrangler secret put <NOMBRE>` y en desarrollo en `apps/server/.dev.vars` (ignorado por git; plantilla en `.dev.vars.example`). **Nunca** en el repositorio.
No hay secretos de sesión que generar: las sesiones son tokens aleatorios con hash en BD y la cookie no se firma.

| Variable | Tipo | Descripción |
|---|---|---|
| `TENANT_BASE_DOMAIN` | var | Dominio base de los negocios (`dosuxsoft.com`; `localhost` en el entorno `dev`) |
| `ENVIRONMENT` | var | `production` o `development`. Solo `development` acepta `X-Forwarded-Host` y deja la cookie sin `Secure` |
| `DEV_TENANT` | var | Solo desarrollo: negocio para `localhost` sin subdominio |
| `BCCR_API_TOKEN` | secreto | Token Bearer del API SDDE del BCCR para el tipo de cambio (opcional; sin él rige el respaldo manual de cada negocio) |
| `OPS_TOKEN` | secreto | Token de 256 bits de la consola de operaciones (`/internal/ops`, `pnpm ops`). `openssl rand -hex 32`; con menos de 32 caracteres el endpoint queda apagado |

---

## 9. Estructura de Carpetas

```
apps/server/       wrangler.jsonc (Worker, DO, R2, crons, assets) · .dev.vars.example · scripts/ops.ts (consola de operaciones)
apps/server/src/   worker.ts (enrutador y crons) · tenant-app.ts · platform-app.ts · do/ (tenant-do, platform-do)
                   db/ (schema, migrations/, migrations.ts, migrator, client.ts, control.ts, bootstrap) · lib/ · middleware/
                   modules/<modulo>/ (routes, service, repository) · modules/ops/ · modules/platform/
                   tests/ (vitest en workerd)
apps/web/src/      features/<modulo>/ · routes/ (TanStack Router) · components/ · app/layout/ · lib/
apps/web/public/   _headers (headers de seguridad y caché) · logo y favicon
packages/shared/   src/schemas/<modulo>.ts · src/money.ts
deploy/            DEPLOY.md (despliegue en Cloudflare)
```

El spec original (`docs/superpowers/specs/2026-06-09-sipnato-pos-design.md`) es histórico: describe la versión de un solo negocio.

---

## 10. Fuera de Alcance (Explícito y Definitivo)

- **Facturación electrónica de Hacienda e IVA (13%)** — descartado definitivamente por el usuario (2026-10-07), también en la versión multi-negocio
- Estados de workflow y abonos en órdenes de servicio/boletas (reconfirmado por el usuario en la Fase D, 2026-10-07)
- Multi-sucursal dentro de un mismo negocio
- MFA / TOTP
- Staging environment

> **Ya no fuera de alcance — planificado para la versión multi-negocio** (ver ROADMAP, Fases B–F):
> multiusuario con roles, inventario/catálogo, plantillas por tipo de negocio, órdenes de servicio
> configurables, colones + dólares, notificaciones a clientes, registro/cobro y panel de superadministrador.

---

## 11. Historial de Actualizaciones

| Fecha | Fase | Cambio |
|---|---|---|
| 2026-06-09 | Pre-dev | Creación inicial del CLAUDE.md tras entrevista de diseño y análisis de seguridad VibeCoder |
| 2026-06-09 | Pre-dev | Dominio de producción confirmado: `www.sipnato.com` · repositorio GitHub conectado |
| 2026-06-09 | Pre-dev | Análisis Opus: integradas regla de zona horaria (sec. 7), break-glass (sec. 6.12 → Fase 2), spike de impresión (Fase 0.5). Impresora objetivo: Epson TM-T20/T88 |
| 2026-06-10 | Pre-dev | Requisito mobile-responsive añadido (sec. 5): consulta de boletas/clientes/reportes desde celular. Layout adaptativo sidebar → hamburguesa/bottom nav. Carpeta `apps/server/scripts/` creada para break-glass. |
| 2026-06-10 | Fase 0 | Monorepo inicializado: pnpm workspaces, TypeScript 5.9, ESLint 9 + Prettier, Vite 6 + React 19 + Tailwind CSS v4, Fastify 5, better-sqlite3 11 (compilado nativamente), argon2, Drizzle ORM, packages/shared con `money.ts`. `pnpm dev` → web :5173 + API :3000/health ✅ |
| 2026-06-10 | Fase 0 | `/grill-me` completado: 7 gaps encontrados y corregidos — `.gitignore` para `data/`+`logs/`, startup `wait-on` server-first, `.env.example` SESSION_SECRET comentado, `eslint-plugin-react-hooks` agregado, `noEmit: true` en tsconfig de web. Flags `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` confirmados como permanentes. |
| 2026-06-10 | Fase 0.5 | Spike de impresión **omitido provisionalmente** — impresora física no disponible. Se retoma en Fase 12 antes de construir el print-bridge. |
| 2026-06-10 | Fase 1 | Schema Drizzle completo: 14 tablas, WAL mode, FK ON, busy_timeout=5000. Auto-migración en startup (`runMigrations()`). Seed de dev. 8 tests pasan. `/health` incluye estado de BD. |
| 2026-06-10 | Pre-dev | Dashboard Modular tipo Odoo definido como arquitectura visual. Skills Vercel añadidos: `/vercel-react-best-practices`, `/vercel-composition-patterns`, `/vercel-react-view-transitions`. `PRODUCT.md` y `DESIGN.md` creados. |
| 2026-06-10 | Fase 2 | Backend auth completo: argon2id passwords+recovery codes, SHA-256 session tokens, cookie HttpOnly+Secure+SameSite=Strict, expiración 8h+60min inactividad, rate limiting por ruta, CORS, Cache-Control:no-store global, break-glass `reset-admin.ts`, cron daily cleanup sesiones expiradas. `/grill-me`: 4 gaps corregidos (COOKIE_NAME y SESSION_DURATION_MS unificados en constantes exportadas, sessionId removido de /me, limpieza de sesiones con node-cron). Nuevos archivos: `src/lib/constants.ts`, `src/jobs/cleanup-sessions.ts`. `@types/node-cron` añadido. tsc limpio. |
| 2026-06-10 | Fase 2 | Frontend auth completo: TanStack Router code-based (login/setup/recover + guard `_auth`), AuthShell split-screen (400px navy + flex-1 form), dark mode flash-free (inline script en `<head>`), Inter Variable (`@fontsource-variable/inter`), OKLCH color tokens en Tailwind v4 `@theme`, resiliencia de red en todos los `beforeLoad` (catch-all → redirect). `w-full` añadido al AuthShell root. tsc --noEmit limpio en web. Fase 2 ✅ COMPLETA. |
| 2026-06-10 | Fase 3 | Branding & Configuración Base completo. Frontend: AppLayout (sidebar navy desktop + drawer + top bar mobile), Logo.tsx, useDarkMode hook, DashboardPage grilla Odoo (2/3/4 cols responsive), SettingsPage TanStack Query + 8 campos + toggle custom. catch-all `$` route bajo `_auth` para módulos pendientes. Brand assets copiados (favicon.svg/ico/og-image.png), OG meta tags + theme-color. Backend: GET/PUT `/api/settings` con `requireAuth` + `audit_log`, `settingsSchema` Zod en `packages/shared`. tsc --noEmit limpio en ambos workspaces. Fase 3 ✅ COMPLETA. |
| 2026-06-10 | Fase 4 | Control de Caja completo. Backend: `modules/cash-registers/` (repository síncrono `.all()/.get()/.run()`, service con invariante caja única en service layer + audit_log en cada acción, 5 rutas REST). Job `auto-close.ts`: cron cada minuto con verificación hora CR UTC-6, cierre retroactivo en startup si servidor estuvo apagado durante la ventana programada. Frontend: `CajaPage.tsx` (estado vacío/abierto, OpenModal, CloseModal con preview totales, HistoryRow expandible, TotalsGrid 2/3 cols responsive). Banner de advertencia sticky en `AppLayout` solo cuando `currentRegister === null` (no mientras carga). Route `/caja` registrada en árbol TanStack Router. tsc --noEmit limpio en ambos workspaces. Fase 4 ✅ COMPLETA. |
| 2026-06-10 | Fase 7 | Clientes & Boletas completo. Shared: `schemas/customer.ts` + `schemas/boleta.ts` con `validateImei` (Luhn), validación phone 8 dígitos CR, idNumber alfanumérico. Backend: `modules/customers/` (LIKE search, GET /:id + boletas) + `modules/boletas/` (find-or-create customer en transacción, consecutivo `boleta`, JOIN en listado, búsqueda multi-campo: nombre/phone/IMEI/consecutivo exacto). Frontend: BoletasPage con búsqueda+lista expandible, NuevoBoletaPage con autocomplete celular+advertencia contraseña plain text+validación IMEI tiempo real, CustomersPage con historial lazy on expand. Rutas /boletas, /nueva-boleta, /clientes. tsc limpio. `/grill-me` pendiente. |
| 2026-06-10 | Fase 6 | Módulo de Gastos completo. Shared: `schemas/expense.ts` (createExpenseSchema, Expense, ExpenseList). Backend: `modules/expenses/` — repository con transacción insert+audit_log, soft-delete con verificación de pertenencia a caja activa, listado con SUM de totales. Service: verifica caja abierta, lanza GastoNoEncontrado/GastoNoEnCajaActiva. 3 rutas REST en `/api/expenses`. Frontend: `ExpensesPage.tsx` — formulario descripción+monto, 3 balance cards (Ingresos/Gastos/Balance neto), lista de gastos con eliminación inline, estado bloqueado sin caja. Route `/gastos`. tsc --noEmit limpio. `/grill-me` pendiente. |
| 2026-06-10 | Fase 5 | Módulo POS completo. Shared: `schemas/sale.ts` (createSaleSchema, Sale, SaleList, PaymentMethod). Backend: `modules/sales/` — repository con consecutivo transaccional (`UPDATE counters SET currentValue + 1 RETURNING` dentro de `db.transaction`), soft-delete con audit_log, listado paginado filtrado por caja activa. Service: verifica caja abierta antes de crear/eliminar venta. 3 rutas REST registradas en `/api/sales`. Frontend: `POSPage.tsx` — formulario (descripción opcional → monto → 4 botones método pago → "Cobrar ₡X"), `ChangeCalcModal` para efectivo (campo recibido → vuelto en tiempo real, confirma solo si recibido ≥ monto), `ToastList` auto-dismiss 4s, `SaleRow` con eliminación inline (confirmar/cancelar), estado bloqueado con link a `/caja` si no hay caja. Route `/pos` registrada. tsc --noEmit limpio en ambos workspaces. `/grill-me` pendiente. |
| 2026-06-10 | Fase 9 | Notas Internas completo. Shared: `schemas/note.ts` (createNoteSchema, updateNoteSchema, Note). Backend: `modules/notes/` — repository sin contador, updateNoteRow setea updatedAt manualmente, hardDeleteNoteRow con snapshot completo (title+body), listNotesRows ordenado por updatedAt desc. Service sin dependencia de caja. 4 rutas REST en `/api/notes`. Error `NotaNoEncontrada` añadido a `errors.ts`. Frontend: `NotesPage.tsx` — DraftCard (crear desde formulario flotante), NoteCard (vista tarjeta + editor inline por card individual, confirmación borrado), grid 1/2/3 cols responsive. Route `/notas` registrada en main.tsx. tsc --noEmit limpio en ambos workspaces. `/grill-me` pendiente. |
| 2026-06-10 | Fase 8 | Cotizaciones completo. Shared: `schemas/quote.ts` (createQuoteSchema+createQuoteItemSchema, Quote, QuoteItem, QuoteWithItems, QuoteList). Backend: `modules/quotes/` — repository con transacción atómica (counter+INSERT quotes+INSERT quoteItems[]×N+audit_log), total calculado server-side (nunca del cliente), hard delete en transacción (DELETE items → DELETE quote → audit_log). Service: sin dependencia de caja (cotizaciones son independientes). 4 rutas REST en `/api/quotes`. Error `CotizacionNoEncontrada` añadido a `errors.ts`. Frontend: `QuotesPage.tsx` (historial paginado 20/página, filas expandibles con detalle bajo demanda via GET/:id, inline delete con confirmación), `NuevaCotizacionPage.tsx` (ítems dinámicos add/remove, total en tiempo real, submit disabled si algún description vacío). Routes `/cotizaciones` y `/nueva-cotizacion` registradas en main.tsx. tsc --noEmit limpio en ambos workspaces. |
| 2026-06-11 | Fases 5–9 + 3 | `/grill-me` ejecutado sobre Fases 5, 6, 7, 8, 9 + Settings (Fase 3 modificada). Hallazgos y correcciones: (1) `updateNoteRow` (Fase 9) carecía de `audit_log` — corregido: envuelto en `db.transaction` + entrada `NOTE_UPDATED` + propagado `meta` a service y routes. (2) Settings `getAllSettings/getSetting/setSetting` usaban `async/await` en llamadas síncronas de better-sqlite3 — corregido a funciones síncronas. (3) En `updateSettings`, el `audit_log` se insertaba fuera de la transacción de `setAllSettings` — corregido: `auditLog` movido dentro de `db.transaction()` en `setAllSettings`; parámetro `audit` añadido. `auto-close.ts` actualizado para llamada síncrona. tsc --noEmit limpio. |
| 2026-06-11 | Fases 3–9 | `/ui-ux-pro-max` auditó las 12 páginas frontend. Correcciones aplicadas en todas las páginas de features: `strokeWidth={1.5}` unificado en todos los iconos Lucide (antes usaban el default `2`); `aria-hidden` añadido a iconos decorativos; touch targets de botones de cancelar-confirmar elevados a `flex h-8 w-8 items-center justify-center rounded` (≥32px) en ExpensesPage, QuotesPage y NotesPage. AppLayout y SettingsPage también corregidos. tsc --noEmit limpio. |
| 2026-06-11 | Fase 10 | Reporte de Ventas completo. Shared: `schemas/report.ts` (reportSalesFilterSchema, reportSummaryFilterSchema, ReportSummary, DailyEntry, ReportSaleRow, ReportSaleList). Backend: `modules/reports/` — `crDayRangeToUtc` convierte fechas CR a UTC-6, listado paginado 50/página, export hasta 5000 filas, summary agrega por método de pago + gastos + balance, daily agrupa por `strftime('%Y-%m-%d', datetime(createdAt, '-6 hours'))`. Frontend: `ReportesPage.tsx` — barra de filtros (4 presets + rango personalizado + búsqueda + método), cuadrícula resumen con `gap-px bg-border` (6 celdas: 4 métodos + gastos + balance), Recharts `BarChart` con tooltip custom, tabla `table-fixed` con paginación, exportación CSV con BOM UTF-8. Route `/reportes` registrada en main.tsx. tsc --noEmit limpio en ambos workspaces. Corrección adicional: `@fastify/cookie`, `@fastify/cors`, `@fastify/rate-limit` actualizados de v9 a v10+ (incompatibles con Fastify 5 — bug pre-existente desde Fase 0). |
| 2026-06-11 | Fase 10 | `/grill-me` ejecutado sobre backend de reportes. 4 hallazgos corregidos: (1) `isoDate` en `report.ts` no validaba calendariamente — fechas como `2026-02-31` crasheaban con `RangeError` — corregido con `.refine(!isNaN(new Date(val).getTime()))`. (2) `getReportSummary` cargaba todas las filas de ventas a memoria para sumar en JS — reemplazado por `GROUP BY paymentMethod` en SQL. (3) `/sales/export` usaba validación manual mixta (Zod + lectura cruda de query) — reemplazado por `reportExportFilterSchema` nuevo. (4) Query daily usaba interpolación TypeScript dentro de `sql\`\`` produciendo texto literal ambiguo — refactorizado a constante `crDay` con string hardcodeado. tsc --noEmit limpio. |
| 2026-06-11 | Fase 11 | Dashboard completo. Shared: `schemas/dashboard.ts` (DashboardData). Backend: `modules/dashboard/` — endpoint único `GET /api/dashboard` con `requireAuth`; repository agrega datos del día CR en UTC-6: estado caja (abierta/cerrada + openedAt + openingAmount), ventas `GROUP BY paymentMethod`, total gastos, balance neto, conteo boletas del día. Frontend: `features/dashboard/api.ts` + `DashboardPage` actualizado — franja de estado horizontal con 3 zonas (`gap-px bg-border`, `rounded-xl border border-border`) encima de la grilla de módulos existente: zona caja (dot verde/naranja + hora apertura o link "Abrir caja →"), zona ventas (4 métodos inline), zona contadores (balance con color semántico + ventas/boletas). Auto-refresco cada 60s, skeleton de carga, error con retry. tsc --noEmit limpio. |
| 2026-06-11 | Fase 11 | `/grill-me` ejecutado sobre backend de dashboard. 1 hallazgo corregido: `crDayRangeToUtc` + `CR_OFFSET_HOURS` duplicados entre `reports/repository.ts` y `dashboard/repository.ts` — extraídos a `src/lib/cr-time.ts` (exporta `crDayRangeToUtc` y `todayCR`); ambos repositorios ahora importan desde ahí. `service.ts` pass-through mantenido intencionalmente para consistencia y extensibilidad en Fase 12. tsc --noEmit limpio. |
| 2026-06-11 | Fase 13 | Despliegue completo. `Dockerfile` multi-stage (build → server + caddy), `deploy/docker-compose.yml`, `deploy/Caddyfile` (HTTPS + SPA routing + WebSocket + security headers), `deploy/backup.sh` (copia externa diaria), `deploy/.env.example`, `deploy/DEPLOY.md` (guía paso a paso VPS + SSH + UFW + print-bridge Windows). `packages/shared/package.json` actualizado con conditional exports (`"types"` + `"tsx"` + `"default"`) y script `build: tsc` — resuelve compatibilidad de módulos en producción Node.js. `prepare` script en raíz auto-compila shared tras `pnpm install`. Backup job interno añadido (`src/jobs/backup.ts` — 03:00 AM CR, rotación 30 días). Endpoint `GET /api/settings/backup/download` implementado (rate limit 5/hora, Content-Disposition: attachment, ruta hardcodeada). tsc --noEmit limpio en todos los workspaces. |
| 2026-06-11 | Fase 12 | Print Bridge completo. Shared: `schemas/print.ts` (SalePrintPayload, BoletaPrintPayload, QuotePrintPayload, TestPrintPayload, createPrintJobSchema, PrintBridgeStatus). Backend: `modules/print/` — repository (insertPrintJob, ackJob con audit_log en transacción, failJob con max 3 intentos), service (in-memory `activeSocket`, registerBridgeSocket/clearBridgeSocket, IP blacklist 3 fallos/min), routes (`GET /ws/print` WS con auth argon2id, `GET /ws/print/status`, `POST /ws/print/jobs`, `POST /ws/print/test`). Settings: `getPrintBridgeTokenHash/setPrintBridgeTokenHash` + `POST /api/settings/generate-print-token` (crypto.randomBytes(32) + argon2id hash). `@fastify/websocket` v11 + `@types/ws` añadidos. Print-bridge: `ws-client.ts` (exponential backoff 1s→30s×2), `printer.ts` (ESC/POS para Epson TM-T20/T88: CP858, COLS=48, stub no-op cuando PRINTER_PATH vacío), `index.ts`. Frontend: `features/print/api.ts`, `AppLayout` con dot verde/gris tokenSet-only, `SettingsPage` con sección bridge (URL, generar/rotar token, copy-once, test print), `POSPage` con botón Printer en SaleRow. `/grill-me`: 1 hallazgo corregido — inicialización tokenSetFlag en nivel de módulo movida dentro de la función plugin (ejecuta después de runMigrations). tsc --noEmit limpio en todos los workspaces. |
| 2026-06-12 | Fase 12 (revisión) | **Print-bridge reemplazado por impresión vía navegador.** El WebSocket bridge resultó demasiado frágil para un solo usuario. Frontend: `window.print()` con overlay React Portal + `@page { size: 80mm auto }` inyectado dinámicamente; body class `print-sale` distingue tickets 80mm (POS) de cotizaciones A4. `SalePrintView` en POSPage, `QuotePrintView` en QuotesPage, ticket de prueba en SettingsPage. Rebrand UI SIPNATO → Dosuxsoft. DEPLOY.md §10 reescrito a instrucciones de impresora predeterminada. |
| 2026-06-12 | Fase 14 | **Módulo Apartados (layaway).** Shared: `schemas/apartado.ts` (createApartadoSchema con depósito inicial, addApartadoPaymentSchema, Apartado/ApartadoWithPayments/ApartadoList). DB: tablas `apartados` + `apartado_payments` (migración 0003), contador `apartado`. Backend: `modules/apartados/` — repository (consecutivo transaccional, paidAmount vía subquery SUM, auto-completado al alcanzar total, audit_log en crear/abonar/cancelar, soft-delete), service (valida estado activo), 5 rutas REST en `/api/apartados`. Errores `ApartadoNoEncontrado` + `ApartadoNoActivo`. Frontend: `ApartadosPage.tsx` (tabs por estado, búsqueda, barra de progreso, modal de creación, abono inline, cancelación con confirmación), ruta `/apartados`, ítem de sidebar (`Package`). Logo/favicon actualizado a `logo.jpg` (monograma DS). tsc --noEmit limpio en los 3 workspaces. |
| 2026-06-12 | Limpieza | **Eliminado todo el print-bridge huérfano** tras migrar a browser-print: `apps/print-bridge/` (app completa), `apps/server/src/modules/print/`, `apps/web/src/features/print/`, `packages/shared/src/schemas/print.ts`, tabla `print_jobs` (migración 0004 DROP), token del bridge en Settings (`generatePrintToken`, `get/setPrintBridgeTokenHash`, ruta `/generate-print-token`), plugin `@fastify/websocket` + `@types/ws`, bloque `/ws/*` en Caddyfile + `wss://` en CSP. Docs sincronizados (README, ROADMAP, CLAUDE, DEPLOY, .env.example). tsc limpio + 8 tests pasan. |
| 2026-06-13 | Post-launch polish | **Logo transparente:** `logo.jpg` → `logo.png` (PNG 1254×1254, conversión luminancia→alpha con PowerShell + System.Drawing — píxeles blancos → opaco, fondo negro → transparente). `mix-blend-screen` eliminado de `Logo.tsx` (ya no necesario). Favicon simplificado a un único `<link rel="icon" type="image/png" href="/logo.png">`. `<link rel="apple-touch-icon" href="/logo.png">` añadido en `index.html` para previews iOS correctos. Banner "No hay caja abierta" eliminado de `AppLayout` permanentemente — el Dashboard cubre ese rol. |
| 2026-06-13 | Post-launch polish | **Animación letter-swap en botón "Ingresar"** (`apps/web/src/routes/login.tsx`): dos `<span>` de `.lb-mother1` / `.lb-mother2` cada uno con los 8 caracteres individualmente. Al hover, `.lb-mother1` se desliza hacia abajo (`translateY(1.2em)`) y `.lb-mother2` entra desde arriba (inicia en `translateY(-3em)`, llega a `0`). Delay escalonado por `nth-child` (0.20s → 0.76s). Animación desactivada en estado `disabled`. CSS puro en `<style>` tag dentro del componente. |
| 2026-06-13 | Post-launch polish | **Personaje animado en panel de login** (`apps/web/src/components/ui/MeshGradientCharacter.tsx`, NUEVO): blob con forma orgánica, mesh-gradient azul animado (`@paper-design/shaders-react@^0.0.76`), dos ojos elipse que siguen el cursor con spring physics (`framer-motion@^12.40.0`, `cx`/`cy` con `type:'spring', stiffness:150, damping:15`), parpadeo periódico vía animación de `ry` `[30,30,30,3,30]` cada 3s, flotación vertical `y:[0,-8,0]` en loop de 2.8s. Mesh gradient clippeado con `clipPath` SVG a la forma del blob via `<foreignObject>`. Fix React 19 + framer-motion: `resolve.dedupe:['react','react-dom']` + `optimizeDeps.include:['framer-motion']` en `vite.config.ts` (duplicated React instance eliminado). |
| 2026-06-13 | Fase 11 (rediseño) + grill-me | `/grill-me` ejecutado sobre backend de dashboard rediseñado. 4 hallazgos: (1) `activeCount` contaba todos los `status='activo'` incluyendo saldo=0 — corregido a `.filter(a => a.totalAmount - a.paidAmount > 0).length`. (2) `yesterdayTotalSales` expuesto en respuesta JSON sin uso en frontend — eliminado del tipo `DashboardData` y del repository. (3) N subqueries correlacionadas para `paidAmount` — tradeoff aceptado (volumen real negligible). (4) Sort de `recentMovements` inestable en colisiones de timestamp — corregido con desempate por `id` y `type`. tsc --noEmit limpio en los 3 workspaces. |
| 2026-06-15 | Fase 15 | **Módulo Ventas a Crédito completo.** Shared: `schemas/credito.ts` (createCreditoSchema, addCreditoPaymentSchema, Credito/CreditoWithPayments/CreditoList/CreditoPayment, CreateCredito, AddCreditoPayment). DB: tablas `creditos` + `credito_payments` (migración `0006_creditos.sql`), contador `credito` en `bootstrapDb`. Backend: `modules/creditos/` — repository (consecutivo transaccional, paidAmount vía subquery SUM, auto-completado al alcanzar total, audit_log en crear/abonar/cancelar, soft-delete ausente en cancelación para que pestaña Cancelados funcione), service (valida estado activo, abono no excede pendiente), 5 rutas REST en `/api/creditos`. Errores `CreditoNoEncontrado`, `CreditoNoActivo`, `AbonoPagoExcede`. Frontend: `CreditosPage.tsx` (tabs por estado, búsqueda, barra de progreso, badge vencido, CreateModal, PaymentModal, CreditoRow expandible con detalle on-demand), ruta `/creditos`, ítem sidebar (`CreditCard`). **Corrección crítica de despliegue:** migración `0006_creditos` registrada en `meta/_journal.json` (sin esto las tablas nunca se crearían en el VPS). **Corrección funcional:** `cancelCreditoRow` dejó de setear `deletedAt` (ahora solo `status='cancelado'`), de lo contrario la pestaña Cancelados nunca mostraba nada — patrón alineado con `cancelApartadoRow`. Formato de montos: `formatColones()` en `money.ts` reemplazado por regex de comas (₡25,000 en vez de ₡25000). Campo `shop_address` añadido a Settings (schema, backend, frontend). Fuentes de impresión aumentadas en `BoletaPrintView.tsx` y `PrintSection` de `SettingsPage.tsx` (base 15px, encabezado 20px). tsc --noEmit limpio en los 3 workspaces. |
| 2026-06-13 | Fase 11 (rediseño) | **Dashboard financiero completo** — reemplaza la grilla de módulos Odoo (redundante con sidebar). Shared: `schemas/dashboard.ts` expandido con `DashboardWeeklyEntry`, `DashboardMovement`, `DashboardApartado`; `DashboardData` añade `today.yesterdayTotalSales`, `today.salesDeltaPct: number \| null`, `weekly` (7 entradas), `recentMovements` (hasta 8), `apartados` (activeCount + totalOwed + top 3). Backend `repository.ts` reescrito: delta vs ayer (`salesDeltaPct = null` cuando ayer = 0), serie semanal 7 días con relleno de ceros en JS para fechas sin ventas, movimientos recientes como union JS (top-8 ventas + top-8 gastos, merge + sort + slice), apartados activos con subquery `paidAmount`, `totalOwed` sumado en JS, `topApartados` ordenados por saldo descendente. Frontend `dashboard.tsx` reescrito — 5 secciones: `KpiStrip` (grid 2/4 cols, 4 celdas), `DeltaBadge` (null→"sin ventas ayer", 0→"igual que ayer", ±% con flecha semántica), `WeeklyChart` (Recharts BarChart + Cell por barra, hoy con `fillOpacity=1` resto `0.32`, empty state), `PaymentMethods` (barras de progreso animadas `transition-[width] duration-500`), `RecentMovements` (tabs Todo/Ventas/Gastos + link a /reportes), `ApartadosCard` (top 3 con barra de progreso verde + link a /apartados), `DashboardSkeleton` animate-pulse. Auto-refresco 60s. tsc --noEmit limpio en los 3 workspaces. Verificado en browser: todas las secciones renderizan correctamente con DB vacía. |
| 2026-06-17 | Post-launch bugfix | **Apartados eliminado del sidebar** — ítem `/apartados` removido de `NAV_ITEMS` en `AppLayout.tsx` (commit `2cee7ed`). El módulo backend y la página siguen existiendo pero no son accesibles desde la navegación; decisión tomada por el usuario. |
| 2026-06-17 | Post-launch bugfix | **`drizzle.config.ts` apuntaba a DB incorrecta** — `sipnato.db` → `dosuxsoft.db` (commit `26832fa`). La BD de producción siempre se llamó `dosuxsoft.db` (volumen Docker `dosuxsoft-data`); el config de desarrollo nunca era crítico pero era engañoso. |
| 2026-06-17 | Post-launch bugfix | **Bug crítico de Drizzle en módulo Créditos** — `listCreditoRows` y `getCreditoWithPaymentsRow` en `modules/creditos/repository.ts` producían 500 en producción: `"You tried to reference 'paidAmount' field from a subquery, which is a raw SQL field, but it doesn't have an alias declared."`. Causa: Drizzle v0.36.4 exige `.as('fieldAlias')` en campos `sql<T>\`...\`` dentro de subqueries nombrados. Fix: añadido `.as('paidAmount')` en ambas funciones (commit `e9cbe24`). El error solo se manifestó en producción porque `tsc` no lo detecta — ver regla de alias en Sección 7. |
| 2026-10-10 | Fase G | **Migración a Cloudflare Workers (código completo en la rama `fase-g-cloudflare`; falta el despliegue).** Decisiones del usuario: se borra el VPS y se empieza de cero (sin migrar datos, no hay clientes); todo en Cloudflare con Workers Paid; la consola de emergencia pasa de SSH a un endpoint con secreto (cambia §6.12/§6.14, aprobado el 2026-10-10). Arquitectura: un Worker con un Durable Object SQLite por negocio (`TenantDO`) y otro de plataforma (`PlatformDO`, reemplaza a `control.db`); el Worker enruta por Host y la petición se atiende dentro del DO con Hono; `db` y `controlDb` siguen fallando cerrado con `AsyncLocalStorage`; RPC entre DO para resolver negocios, código de activación, suscripción y tipo de cambio. Fastify, better-sqlite3, node-cron, Docker, Caddy y los scripts por SSH desaparecen. argon2id en WebAssembly con m=19456, t=2, p=1 y rehash al iniciar sesión. Frontend como Static Assets con `_headers`. Respaldos: PITR de 30 días + JSON diario a R2 + descarga JSON del dueño (sin sesiones); antes de migrar se guarda un bookmark `pre-migracion:<tag>`. Rate limits en el kv del DO con `CF-Connecting-IP`. Cierre automático de caja con alarma por negocio; crons para el tipo de cambio y el mantenimiento diario. Consola `POST /internal/ops` + `OPS_TOKEN` + `pnpm ops` (superadmins, negocios, reset-owner, bookmarks, restore-tenant). Revisión final: protección CSRF (`sameOriginWrites`: origen propio y `application/json` en toda escritura) y panel tolerante a negocios caídos. Desarrollo local con `wrangler dev` (:8787) + Vite (:5174). Tests: 213 en `workerd` (antes 88), `tsc`, lint y formato limpios. Pendiente: activar R2, desplegar, DNS `*` Proxied, superadmin en producción y simulacro de restauración PITR (no se puede probar en local). |
| 2026-10-11 | Fase G | **Desplegada en producción** (Worker `dosuxsoft`, R2 `dosuxsoft-backups` con borrado a 30 días, secretos, DNS `*` → `AAAA 100::` Proxied, superadmin `admin`, simulacro PITR exitoso). `/grill-me`: decisiones del usuario — respaldar también negocios suspendidos; eliminar negocios solo por consola (`pnpm ops tenant-delete`, solo suspendidos; borra su DO, registro y pagos; R2 conserva 30 días); regla WAF de límite de pedidos por IP en `/api/` y `/auth/` (100/10 s); el `OPS_TOKEN` va a un gestor de contraseñas. Además: el panel no muestra formularios de un negocio no disponible, la descarga de respaldo exige `Sec-Fetch-Site` de la misma página y las consultas del panel a cada negocio tienen tiempo límite de 5 s. 219 tests. Rama fusionada en `main`. |
| 2026-10-11 | Fase G (`/grill-me`) | Ajustes de la revisión técnica. Decisiones del usuario: el mantenimiento diario también cubre a los negocios suspendidos (`listMaintainedSlugs`; un DO nunca inicializado no hace nada ni crea tablas) y eliminar un negocio solo por consola (`tenant-delete`, solo suspendidos, irreversible: `TenantDO.destroy()` y después su fila y sus pagos en `control.db`; error `NEGOCIO_NO_SUSPENDIDO`; el panel no tiene botón). Además: el resumen que el panel pide a cada negocio se abandona a los 5 s (queda "No disponible"); en ese estado el detalle oculta el uso y no deja cambiar tipo, módulos ni emitir código; la descarga del respaldo (GET con efectos) exige mismo origen (`sameOriginOnly`). Tests nuevos en `scheduled`, `ops`, `csrf` y `platform`. |
| 2026-10-11 | Rendimiento | **Latencia de la API** (medido: ~330–430 ms por llamada desde CR, con la plataforma en Singapur). (1) Durable Objects con `locationHint: 'enam'` (`platform(env)`, `tenantStub(env, slug)`); la plataforma pasa al objeto `platform-enam` y copia una sola vez los datos del original (`db/legacy-platform.ts`, marca `migrated-from-legacy`). Los negocios ya creados (p. ej. `open-accesorios`) siguen donde nacieron, con sus datos. (2) El Worker ya no consulta a la plataforma en cada petición de un negocio: el estado vive en el kv `status` del `TenantDO` (sin la clave = activo), se elimina `resolveTenant` y su caché; suspender avisa primero al negocio (503 si no responde) y rige al instante; el cron diario reconcilia. (3) Menos escrituras durables: límite general en memoria, última actividad de la sesión a lo sumo una vez por minuto. 236 tests. |
| 2026-10-08 | Panel | **Tipo de negocio y módulos asignados desde el panel.** Decisiones del usuario: el dueño solo los ve; los campos y nombres de las órdenes los sigue editando el dueño. Shared: `ownerProfileSchema`, `assignBusinessSchema`, `applyAssignment`; `setupSchema` sin `template`; `createTenantSchema` con `template` y `modules`; `PlatformTenant` con tipo y módulos. Backend: `modules/business/service.ts` (NUEVO: `updateOwnerProfile`, `assignBusiness`), `PUT /api/business` solo nombres y campos, `PUT /platform/tenants/:slug/business` (auditado `TENANT_BUSINESS_ASSIGNED`), alta del panel y `tenant create` asignan el tipo, el setup ya no lo toca. Frontend: `features/platform/BusinessTypeFields.tsx` (NUEVO) en Nuevo negocio y en el detalle (advertencia al cambiar de tipo), tipo en la lista; Configuración del negocio muestra tipo y módulos de solo lectura; el setup ya no pide tipo. Tests: business (dueño no cambia tipo/módulos, la plataforma apaga módulos, cambio de tipo) y platform (alta con tipo, reasignación, aislamiento); 88/88. Verificado en navegador: cambio de módulos y de tipo desde el panel y vista de solo lectura del dueño. |
| 2026-10-08 | Git | PR #1 (Fases A–D), #2 (Fase E) y #3 (Fase F + `/grill-me` + revisión general) fusionados en `main` en ese orden, con merge commit para conservar la historia de las ramas encadenadas. Ramas `fase-a-multi-tenant`, `fase-e-dolares-notificaciones` y `fase-f-registro-superadmin` eliminadas (local y GitHub). Pendiente: despliegue en el servidor (ROADMAP → Estado actual). |
| 2026-10-07 | Revisión general | Limpieza y correcciones antes de producción. **Seguridad/configuración:** quitado CORS (autorizaba a `www.dosuxsoft.com` a leer la API de los negocios con sesión, porque las cookies `SameSite=Strict` viajan entre subdominios del mismo sitio) y la variable sin uso `SESSION_SECRET`; quitado `LOG_PATH` (los logs nunca fueron a archivo) y la rotación pasó a Docker (5 × 20 MB) para no llenar el disco. **Bug:** el panel marcaba "Sin activar" a un negocio migrado de la versión anterior (miraba el código de activación pendiente); ahora mira si la BD tiene usuarios (test nuevo). **Frontend:** 12 errores de lint corregidos (incluidos 3 `setState` dentro de `useEffect`: al encontrar un cliente por teléfono ya no se sobrescribe el nombre corregido en cada consulta); la animación del login y Recharts se cargan aparte (bundle inicial de 345 a 184 KB gzip) con un `SalesBarChart` compartido por dashboard y reportes; error en consola de la animación del login (elipses sin valor inicial); etiquetas de métodos de pago desde `PAYMENT_METHOD_LABELS`; `og-image.png` con el monograma DS (era el logo viejo de SIPNATO); descripción de `index.html` multi-negocio; Vite en el puerto 5174. **Eliminado:** código sin uso (3 errores, 5 funciones de repositorio, `parseColones`, esquemas y tipos sin referencias), dependencias `pino` y `@fastify/cors` (`tsx` pasó a desarrollo), favicons con el logo viejo, carpetas vacías con `.gitkeep`, `.env.example` de la raíz (ahora `apps/server/.env.example`). **Datos:** la BD de desarrollo se vació (solo había datos de prueba). **Formato:** Prettier aplicado a todo el código por primera vez (excluye `.md` y migraciones, ver `.prettierignore`). `theme-init.js` ahora respeta `prefers-color-scheme` en la primera visita, como decía §5. **Docs:** README, PRODUCT.md, DEPLOY.md (migración de la BD anterior corregida, backups de `_control`, checklist) y ACTUALIZAR-VPS.md reescritos para la versión multi-negocio. 85/85 tests. |
| 2026-10-07 | `/grill-me` A–F | Revisión técnica del backend de las Fases A–F. Verificado sin cambios: todas las rutas de negocio exigen sesión; cancelar/anular restringido a dueño/admin y eliminar ventas/gastos con autorización; el `audit_log` de órdenes no guarda valores de campos (contraseñas de clientes); el puerto 3000 no se publica (solo Caddy); `env_file` pasa `BCCR_API_TOKEN`. **Corregido:** (1) `control.db` no se respaldaba (desde la Fase F guarda pagos, precios y cuentas del panel) → respaldo diario en `backups/_control/`, que `backup.sh` ya copia. (2) Carreras entre verificación y escritura separadas por `await` (setup del dueño → 500 en vez de 409; alta de usuarios y de negocios duplicados) → hashes primero, verificación e inserción sin pausas. (3) Sin copia antes de migrar → `pre-migracion-*.db` por negocio con migraciones pendientes; test nuevo `src/tests/migrations.test.ts` que además sube una BD en el estado de producción (0006) hasta la 0010. (4) El aviso de vencimiento tardaba hasta 1 h en irse tras un pago → 10 min. Decisión del usuario: cotizaciones y notas siguen pudiéndose borrar por cualquier rol. 84/84 tests. |
| 2026-10-07 | Fase F | **Panel de la plataforma y cobro de la mensualidad.** Decisiones del usuario: alta de negocios solo desde el panel; cobro manual por SINPE/transferencia; un atraso solo genera avisos; un plan con precio por defecto y precio especial por negocio. `control.db`: columnas de contacto/precio/vencimiento en `tenants`, tablas `superadmins`, `platform_sessions`, `subscription_payments`, `platform_settings`, `platform_audit_log`. Backend: `modules/platform/` (NUEVO: sesión del superadministrador con bloqueo, alta con BD y código de activación, datos y vencimiento auditados, pagos y anulaciones, suspensión, configuración de cobro), `middleware/platform-auth.ts` (NUEVO), subdominio `admin` aislado en `middleware/tenant.ts`, `modules/subscription/` (NUEVO: `/api/subscription` para dueño y admins), `scripts/superadmin.ts` (NUEVO), tls-check acepta `admin.`, limpieza diaria de sesiones del panel. Shared: `schemas/platform.ts` (NUEVO: validación del subdominio movida aquí, `addMonths`, `subscriptionStatus`, esquemas y tipos del panel). Frontend: `features/platform/` (NUEVO: login, negocios con resumen de cobros y filtros, alta con código enviable por WhatsApp, detalle con pagos/recordatorio/datos/acceso/actividad, configuración), `features/subscription/` (NUEVO: aviso de vencimiento en el layout y sección en Configuración). Deploy: Caddy enruta `/platform/*`; DEPLOY.md con la cuenta del panel. Tests: `src/tests/platform.test.ts` (NUEVO, 16 casos); 82/82 pasan. Verificado en navegador: login, configuración de cobro, alta de negocio con subdominio sugerido, activación con el código, aviso "vence el 09 oct" en el negocio, recordatorio y pago de 3 meses que corre el vencimiento al 09 ene 2027, vista de celular y modo oscuro. |
| 2026-10-07 | Fase E | **Cobro en dólares y avisos a clientes por WhatsApp.** Decisiones del usuario: cobrar en USD con contabilidad en colones; tipo de cambio automático del BCCR; avisos por WhatsApp que la persona envía con un toque; avisos de orden recibida/lista, cobro de créditos, abono registrado y cotización. DB: migración `0010_dolares_avisos.sql` (campos USD en `sales`, totales USD en el cierre de `cash_registers`, tabla `customer_notifications`); `exchange_rates` en `control.db`. Backend: `lib/bccr.ts` (NUEVO: cliente API SDDE, compra 317/venta 318), `jobs/exchange-rate.ts` (NUEVO: consulta horaria global), `lib/exchange-rate.ts` (NUEVO: compra BCCR reciente o respaldo manual), método de pago `dolares` con conversión y vuelto calculados en el servidor, totales de caja con dólares en caja y vueltos, reportes y dashboard con dólares, `/api/exchange-rate` y `/api/notifications` (NUEVOS), settings `usd_manual_rate` y plantillas `msg_*`. Shared: utilidades USD en `money.ts`, `schemas/notifications.ts` (NUEVO: plantillas, `renderMessage`, `whatsappLink`). Frontend: botón "Dólares" y diálogo de cobro en USD en el POS, dólares en caja y arqueo, Configuración con tipo de cambio y editor de mensajes, `WhatsAppNotify` + historial en órdenes (comprobante / listo para retirar), créditos (recordar cobro, comprobante de abono), apartados (comprobante de abono) y cotizaciones. **Bugs previos corregidos:** fechas sin hora (vencimiento de créditos) se mostraban un día antes y un crédito figuraba vencido el mismo día de su vencimiento. Tests: `src/tests/currency.test.ts` (NUEVO, 11 casos, incluye el cliente BCCR con respuestas simuladas); 66/66 pasan. Verificado en navegador: respaldo de ₡505.50, cobro de ₡8,000 con $20 → vuelto ₡2,110, caja con $20.00 en dólares, aviso por WhatsApp con mensaje y número correctos y su historial. |
| 2026-10-07 | Fase D | **Plantillas por tipo de negocio y órdenes de servicio configurables.** Decisiones del usuario: 5 plantillas (celulares, electrónica, taller mecánico, tienda sin servicio técnico, genérico); campos editables por el dueño; sin estados en las órdenes; módulos propuestos por la plantilla y ajustables por el dueño. DB: migración `0009_perfil_negocio.sql` (tabla `business_profile` con perfil "celulares" para todo negocio existente; `boletas.fields` JSON; IMEI y contraseña de las boletas existentes migrados a `fields`; columnas `imei`/`unlock_password` e índice eliminados). Backend: `modules/business/` (NUEVO: GET para todos, PUT solo dueño, auditado), `middleware/module.ts` (NUEVO: `registerModuleRoutes`, 404 `MODULO_DESACTIVADO`), boletas validan `fields` contra el perfil y buscan en ellos (placa, serie, IMEI...), setup aplica la plantilla elegida. Shared: `schemas/business.ts` (NUEVO: plantillas, `validateOrderFields`, `fieldKeyFromLabel`; `validateImei` movido aquí). Frontend: perfil en el contexto del router (`useBusiness`, `requireModule`), menú filtrado por módulos y con el nombre de las órdenes del negocio, formulario de orden generado desde el perfil (texto, número, lista, IMEI, contraseña del cliente con aviso), editor en Configuración (plantillas con confirmación inline, nombres, campos con orden/tipo/obligatorio/opciones, módulos), setup con tipo de negocio, dashboard y POS respetan módulos, textos genéricos ("negocio" en vez de "taller"). Tests: `src/tests/business.test.ts` (NUEVO, 8 casos incluida la migración con boletas del formato anterior); 55/55 pasan. Verificado en navegador: cambio a plantilla de taller, menú actualizado sin recargar, módulo apagado bloqueado, orden con validación de placa y kilometraje. |
| 2026-10-07 | Fase C | **Inventario / catálogo integrado al POS.** Decisiones del usuario: carrito con varios productos + líneas libres; vender sin stock avisa y permite; entradas y ajustes simples con motivo; admin/dueño gestionan, el cajero consulta. DB: migración `0008_inventario.sql` (`products` con código único parcial y `track_stock` para servicios, `stock_movements` como historial con `stock_after`, `sale_items` con precio y costo copiados). Backend: `modules/products/` (NUEVO: listado con filtros activos/stock bajo/desactivados, lookup por código para lectores de barras, CRUD, entradas que actualizan el costo al de la última compra, ajustes por conteo con motivo obligatorio calculados dentro de la transacción, historial), `applyStockChange` como único punto que toca el stock; ventas: precio desde el catálogo, descuento de stock en la transacción de la venta, `stockWarnings`, devolución de stock al eliminar, descripción resumen automática, líneas en el listado. Venta de monto libre sin cambios. Permisos `manageInventory`/`viewCosts`; costos ocultos para el cajero. Frontend: pantalla Inventario (lista densa, filtros, alta inline, fila expandible con edición, "Llegó mercadería"/"Corregir conteo" e historial), POS con buscador/escáner y carrito con cantidades y aviso de stock, ticket impreso con líneas. **Bug encontrado y corregido:** fechas con default `datetime('now')` (UTC sin `Z`) se mostraban 6 h corridas; regla añadida en §7. Tests: `src/tests/inventory.test.ts` (NUEVO, 11 casos); 47/47 pasan. Verificado en navegador: escaneo, búsqueda, carrito con aviso de stock, línea libre, cobro SINPE, stock y costos por rol, entrada con historial. |
| 2026-10-07 | Fase B | **Multiusuario con roles dueño/admin/cajero.** Decisiones del usuario: cajero vende, abre/cierra caja y ve reportes; eliminar ventas/gastos requiere autorización de admin/dueño; no cancela créditos/apartados; login con PIN de 6 dígitos para cajeros; admin gestiona cajeros, solo el dueño gestiona admins, configuración y backups; el PIN compartido de borrado se elimina. DB: migración `0007_usuarios.sql` (tabla `users`, el admin existente pasa a ser el dueño con usuario `dueno`, se elimina `admin`, `sessions` recreada con `user_id`, `audit_log.user_id`, se borra `sales_delete_pin_hash`). Backend: `modules/users/` (NUEVO: CRUD con reglas de jerarquía, `verifyCredentials` con bloqueo 5 intentos/15 min, `verifySupervisor`, cambio de secreto propio), `middleware/authorization.ts` (NUEVO: `authorizeOrEscalate`), `requireRole`, actor en el contexto ALS (`setActor`/`currentActorId`) y `userId` en las 23 inserciones de audit_log, `/auth/me` devuelve el usuario, recover devuelve el usuario del dueño, cancelar/anular restringido a admin/dueño, settings PUT y backup solo dueño. Shared: schemas de usuarios + matriz `PERMISSIONS`. Frontend: pantalla Usuarios (lista + alta/restablecer inline), Mi cuenta (cambiar contraseña/PIN), `SupervisorAuthDialog` en POS y Gastos (reemplaza el modal de PIN), sidebar filtrado por rol + bloque del usuario actual, login con usuario, setup con nombre/usuario del dueño, botones de cancelar/anular ocultos sin permiso, guards de ruta. Tests: `src/tests/users.test.ts` (NUEVO, 14 casos); 36/36 pasan. Verificado en navegador con la BD de desarrollo migrada (admin → dueño) y un flujo real de cajera eliminando con autorización. |
| 2026-10-07 | Fase A | **Multi-negocio con BD separada por negocio.** Backend: `db/control.ts` (NUEVO — `control.db` con tabla `tenants`: slug/nombre/estado, validación de slug como label DNS + reservados), `db/client.ts` reescrito (caché de conexiones por negocio, migraciones + bootstrap al primer `openTenantDb`, `AsyncLocalStorage` con `runWithTenant`, `db` como proxy que falla cerrado fuera de contexto), `middleware/tenant.ts` (NUEVO — hook `onRequest` Host → slug → 404/403/contexto), rate limit por negocio+IP, `/internal/tls-check` para on-demand TLS de Caddy, `/health` sobre `control.db`. Jobs (`auto-close`, `backup`, `cleanup-sessions`) recorren negocios activos vía `jobs/for-each-tenant.ts` (NUEVO); backups en `backups/<slug>/`. Descarga de backup derivada del negocio del request. Scripts: `scripts/tenant.ts` (NUEVO: create/list/suspend/activate), `reset-admin.ts <slug>`, `seed.ts [slug]`. Env: `DATABASE_PATH`/`BACKUP_PATH` → `DATA_DIR` + `TENANT_BASE_DOMAIN` + `DEV_TENANT`. Script `db:migrate` eliminado (las migraciones son por negocio). **Código de activación de un solo uso** para `/auth/setup` (hallazgo de la revisión de seguridad: sin él, quien llegara primero al subdominio de un negocio nuevo podía reclamar su admin) — columna `setup_code_hash` en `control.db`, `tenant setup-code <slug>`, campo en el formulario de setup. Tests: `src/tests/tenancy.test.ts` (NUEVO — 14 casos: BD separada, sesión/contraseña/datos no cruzan, código de activación propio y de un solo uso, 404/403, hosts maliciosos, tls-check, backup por negocio, falla cerrado); 22/22 pasan. Frontend: pantalla `/no-disponible` (negocio inexistente/suspendido) + `features/auth/tenant-guard.ts`. Deploy: Caddyfile `*.dosuxsoft.com` con on-demand TLS, apex/www como placeholder, compose con nuevas env, `backup.sh` por negocio, DEPLOY.md (DNS comodín en Cloudflare "Solo DNS", crear negocios, migrar BD anterior). **Bugs previos encontrados y corregidos:** (1) `login.tsx`/`setup.tsx` detectaban redirects con `'_isRedirect' in e`, propiedad que ya no existe en TanStack Router 1.170 (los redirects son `Response` con `.options`) → el redirect a `/setup` se perdía y un sistema sin admin mostraba "Iniciar sesión" (el síntoma visto en producción en agosto); ahora usan `isRedirect` de la librería. (2) Un `apps/web/vite.config.js` generado por `tsc -b` el 2026-06-12 (ignorado por git) tenía prioridad sobre `vite.config.ts` en desarrollo: ningún cambio de config de Vite desde esa fecha se aplicaba localmente (incluido el fix de framer-motion); `tsconfig.node.json` ahora emite a `node_modules/.tmp`. (3) Proxy de Vite con `changeOrigin: false` para conservar el subdominio. IVA/Hacienda descartados definitivamente. |
| 2026-06-17 | Docs | **`DATABASE_PATH` default en CLAUDE.md corregido** — `sipnato.db` → `dosuxsoft.db`. Regla de alias en subqueries Drizzle añadida a Sección 7. Diagnóstico de BD en `deploy/ACTUALIZAR-VPS.md` corregido: el comando `node -e` debe ejecutarse desde `/app/apps/server` (pnpm workspace instala `better-sqlite3` allí, no en `/app`). |
| 2026-10-14 | Renombre | **El proyecto se llama Dosuxsoft POS** (decisión del usuario; SIPNATO POS era el nombre anterior). Paquetes del monorepo `@sipnato/*` → `@dosuxsoft/*` (imports, `package.json`, `tsconfig`, `pnpm-lock.yaml`), raíz `sipnato-pos` → `dosuxsoft`, títulos de CLAUDE.md y ROADMAP.md y comandos `pnpm --filter` de README y DEPLOY. **Sin cambiar a propósito:** la cookie `sipnato_session` (renombrarla cerraría la sesión de todos los usuarios en producción), la URL del repositorio de GitHub (`SIPNATO-POS`) y las entradas históricas de este archivo, el ROADMAP y `docs/`. |
| 2026-10-14 | Entorno | **Desarrollo movido de Windows a macOS (Apple Silicon).** La carpeta copiada desde Windows llegó sin archivos ocultos (`.git` vacío, sin `.gitignore`, `.gitattributes`, `.prettierrc`, `.prettierignore`, `.dev.vars.example`, `.claude/launch.json` ni los `.gitkeep`) y con `node_modules` vacío. Se reconectó git con `origin/main` (la copia local era idéntica a GitHub), se restauraron esos archivos, se instaló pnpm 12 con Homebrew y se fijó en `packageManager`, se reinstalaron las dependencias (binarios de `workerd` y `esbuild` para macOS arm64) y se creó un `.dev.vars` local con un `OPS_TOKEN` nuevo de desarrollo. `.gitignore`/`.prettierignore` ignoran el estado local de plugins de Claude (`.claude-flow/`, `.omc/`, `.superpowers/`). README y DEPLOY sin instrucciones de PowerShell ni Git Bash. Verificado en la Mac: `tsc`, lint, formato, 239 tests, build de la web y `wrangler dev` + Vite. |
| 2026-10-19 | Diseño | **Azul de marca `#0758D6`** (decisión del usuario) en lugar del azul ejecutivo `#1E3A5F`: `--color-brand-navy` en `globals.css` (barra lateral, barra superior en celular, panel del login y encabezado del panel de admin) y `theme-color` de `index.html`. Como el fondo es más claro, el texto blanco translúcido de esas barras sube de opacidad (60 → 80 %, 50 → 75 %) para mantener el contraste (≥ 4,5:1 en los ítems del menú). El azul de botones y enlaces (`--color-brand-blue`) no cambia. |
| 2026-10-20 | Diseño | **Azul de marca `#0A2947`** (decisión del usuario), en lugar de `#0758D6`: `--color-brand-navy` y `theme-color`. Marino oscuro: el texto blanco de las barras queda en ~15:1; se conservan las opacidades subidas el 2026-10-19. |
| 2026-10-20 | Diseño | **Menú lateral `#1D1616` en modo oscuro** (decisión del usuario). Token nuevo `--color-brand-menu` (`#0A2947` en claro, `#1D1616` bajo `.dark`) usado por la barra lateral y el menú desplegable de celular (`bg-brand-menu`). La barra superior de celular, el panel del login y el del panel de admin siguen en `--color-brand-navy`. |
| 2026-10-20 | Diseño | **Fondo `#1D1616` en modo oscuro** (aclaración del usuario: el color pedido era el del fondo, no el del menú). Se revierte `--color-brand-menu` (el menú vuelve a `#0A2947` en ambos modos). En `.dark`: `--color-surface-bg` `#1D1616` y, para que las tarjetas sigan por encima del fondo, `--color-surface-card` `#261E1E`, `--color-surface-input` `#211919` y `--color-border` `#3A2F2F`. Modo claro sin cambios. |
| 2026-10-20 | Diseño | **Fondo `#222831` en modo oscuro** (decisión del usuario), en lugar de `#1D1616`. Tarjetas `#2A313B`, campos `#1E242C` y bordes `#3A424E`, de la misma familia gris azulada. `--color-text-muted` en oscuro sube de 52 % a 60 % de luminosidad para mantener ~4:1 sobre las tarjetas. Modo claro y menú (`#0A2947`) sin cambios. |
| 2026-10-20 | Diseño | **Fondo `#171717` en modo oscuro** (decisión del usuario), en lugar de `#222831`. Tarjetas `#212121`, campos `#1B1B1B` y bordes `#333333` (grises neutros). Modo claro y menú (`#0A2947`) sin cambios. |
| 2026-10-20 | Diseño | **Línea de separación entre el menú lateral y el contenido** (pedido del usuario): `border-r border-white/10` en la barra lateral de escritorio, la misma línea que separa el bloque del usuario. Se nota sobre todo en modo oscuro. |
| 2026-10-20 | Diseño | **Resumen de Reportes en un solo color** (pedido del usuario): los montos por método, gastos y balance usan `text-text-primary` (blanco en oscuro) en vez de verde/ámbar/azul/rojo. El balance negativo ahora lleva el signo "−" (antes solo se distinguía por el rojo). |
| 2026-10-20 | Diseño | **Caja en un solo color** (como Reportes): totales por método, total de ventas, gastos, dólares en caja y balance neto (caja abierta e historial) en `text-text-primary`. Negativos con signo "−" (`signedColones`; `formatColones` de un negativo daba `₡-…`). Las etiquetas "Caja abierta"/"Abierta" quedan neutras con un punto verde, como el aviso del Dashboard. Errores y el botón de cerrar caja conservan su color. |
| 2026-10-20 | Diseño | **Dashboard y panel de admin en un solo color** (como Caja y Reportes). Dashboard: balance del día, montos de movimientos recientes (con `+`/`−`) y comparación con ayer (con flecha) en colores de texto; íconos de movimientos neutros; barra de apartados en el mismo azul que la de métodos de pago. Admin: resumen (vencidos, por vencer) en `text-text-primary`; etiquetas de suscripción y "No disponible" neutras con un punto de color; "vence/venció" urgente en negrita en vez de rojo. Reportes: la etiqueta del método de pago en la tabla de ventas también queda neutra. Errores, botones de suspender y avisos siguen con su color. |
| 2026-10-24 | Diseño | **Dashboard con estilo de tarjetas** (maqueta aprobada por el usuario en `docs/maquetas/`, basada en una referencia; se mantiene la barra lateral). Saludo según la hora de CR con el nombre del usuario; tarjeta "Ventas de hoy" con caja, comparación con ayer, botones Cobrar (`/pos`) y Nueva orden (`/nueva-boleta`, o Registrar gasto si el módulo de órdenes está apagado) y métodos de pago como mini-tarjetas (lista en celular); 4 indicadores con el balance destacado en `brand-blue`; gráfico semanal con barras redondeadas (`barRadius` opcional en `SalesBarChart`); apartados; movimientos recientes como tabla (método y hora se ocultan en celular). Tarjetas `rounded-3xl`, controles redondos. Solo datos que ya entrega `/api/dashboard`. Se quita la píldora de caja del encabezado (la caja está en la tarjeta de ventas). |
