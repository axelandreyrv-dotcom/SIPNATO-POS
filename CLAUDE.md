# CLAUDE.md — Biblia del Proyecto SIPNATO POS

> Este archivo es la fuente de verdad del proyecto. Se actualiza al finalizar cada fase.
> Última actualización: 2026-10-07 · Estado: **Fases A–F completas** — BD por negocio · usuarios con roles · inventario · plantillas por tipo de negocio · cobro en dólares y avisos por WhatsApp · panel de la plataforma con cobro de la mensualidad ✅

---

## 1. Identidad del Proyecto

| Campo | Valor |
|---|---|
| Nombre | SIPNATO POS |
| Propósito | Sistema POS multi-negocio — nació para un taller de celulares; se generaliza a otros tipos de tienda |
| País / Zona horaria | Costa Rica · `America/Costa_Rica` |
| Moneda | Colones costarricenses (₡). Los dólares solo se reciben en caja y se convierten (Fase E) |
| Usuarios | Por negocio: un **dueño**, administradores y cajeros (Fase B, ver §6.13) |
| Tipo de sistema | Aplicación web privada detrás de login · cada negocio en su subdominio HTTPS (`<slug>.dosuxsoft.com`) con su propia BD |

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
| pnpm | latest | Gestor de paquetes + workspaces |
| TypeScript | ~5.x | Lenguaje único en todo el proyecto |
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

### `apps/server` — Backend API
| Herramienta | Propósito |
|---|---|
| Fastify v5 | Framework HTTP |
| better-sqlite3 | Driver SQLite síncrono de alto rendimiento |
| Drizzle ORM | Schema, queries type-safe y migraciones |
| argon2 (argon2id) | Hash de contraseñas y recovery codes |
| node-cron | Jobs programados (cierre auto, backup) |
| pino (incluido en Fastify) | Logging estructurado a la salida estándar |
| zod | Validación de env vars y requests |

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
| Hosting | VPS Ubuntu 22.04 LTS |
| Reverse proxy + HTTPS | Caddy (Let's Encrypt automático) |
| Contenedores | Docker Compose (server + caddy) |
| Base de datos | SQLite · `control.db` (registro de negocios) + **un archivo por negocio** `tenants/<slug>.db` · WAL mode |
| Respaldo | backup diario interno por negocio (better-sqlite3 backup API) en `backups/<slug>/` y de `control.db` en `backups/_control/` · rotación 30 días · copia `pre-migracion-*.db` antes de migrar un negocio con datos |
| HTTPS por negocio | Caddy on-demand TLS · `ask` a `/internal/tls-check` (solo emite para negocios activos) |

---

## 4. Arquitectura

```
[Navegador — SPA React en taller.dosuxsoft.com] ──window.print()──► Ticketera 80mm
        │ HTTPS (Caddy, on-demand TLS por subdominio)
        ▼
   API Fastify ── hook onRequest: Host → slug → control.db (¿existe? ¿activo?)
        │                                      │
        │  AsyncLocalStorage: `db` = BD de ese negocio      node-cron: cada job recorre
        ▼                                                    los negocios activos uno a uno
   /app/data/control.db                  ← registro de negocios + plataforma (suscripción, superadmins); sin datos operativos
   /app/data/tenants/<slug>.db           ← TODOS los datos de un negocio (ventas, sesiones, audit…)
   /app/data/backups/<slug>/             ← respaldos de ese negocio
```

### Aislamiento multi-negocio (Fase A)
- **Una BD por negocio.** Sesiones, admin, audit_log y datos viven en `tenants/<slug>.db`. Un token de sesión de un negocio no existe en la BD de otro.
- El negocio se resuelve **solo en el servidor**, desde el `Host` (`middleware/tenant.ts`). Inexistente → 404 `NEGOCIO_NO_ENCONTRADO`; suspendido → 403 `NEGOCIO_SUSPENDIDO`.
- `db` (de `db/client.ts`) es un proxy al negocio del contexto actual. **Falla cerrado:** usarlo fuera de un negocio lanza error en vez de caer en una BD por defecto.
- El slug pasa por un regex de label DNS antes de convertirse en nombre de archivo (barrera contra path traversal). Subdominios reservados: `www`, `api`, `app`, `admin`, `mail`, `static`, `assets`, `control`.
- La cookie de sesión no lleva `Domain` → queda atada a su subdominio.
- Rate limit por negocio + IP.
- Test de aislamiento: `apps/server/src/tests/tenancy.test.ts` — **debe pasar siempre**.

### Panel de la plataforma (Fase F)
- `admin.<dominio>` (`PLATFORM_SUBDOMAIN`, reservado como slug) es el panel de superadministrador. Misma SPA: `main.tsx` carga `features/platform/PlatformApp` (lazy) según el Host.
- En el servidor, `middleware/tenant.ts`: desde `admin.` **solo** responde `/platform/*` y nunca entra al contexto de un negocio; desde cualquier otro subdominio `/platform/*` da 404. `requirePlatformAuth` lo vuelve a comprobar.
- Test: `apps/server/src/tests/platform.test.ts` — **debe pasar siempre** (aislamiento del panel, bloqueo, pagos, suspensión).

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
| Azul ejecutivo | `#1E3A5F` | Color primario, sidebar, botones principales |
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
| Hash de contraseñas | `argon2id` con `{ memoryCost: 65536, timeCost: 3, parallelism: 4 }` |
| Sesión — duración absoluta | **8 horas** |
| Sesión — timeout de inactividad | **60 minutos** |
| Almacenamiento de sesión | Cookie `HttpOnly` + `Secure` + `SameSite=Strict` · tabla `sessions` en BD |
| Al cambiar contraseña/PIN o desactivar | Invalidar **todas** las filas de `sessions` de ese usuario (`revokeUserSessions`) |
| Login | Usuario + contraseña (dueño/admin) o usuario + PIN de 6 dígitos (cajero). 5 fallos → bloqueo de 15 min por usuario (además del rate limit por IP). Usuario inexistente = mismo tiempo y mensaje que contraseña incorrecta |
| Recovery code | Generado con `crypto.randomBytes(16).toString('hex')` · mostrado UNA vez · almacenado hasheado con argon2id · invalidado al usarse (genera uno nuevo) |
| Código de activación (Fase A) | `/auth/setup` exige un código de un solo uso emitido por `tenant create` / `tenant setup-code` (64 bits, `XXXX-XXXX-XXXX-XXXX`, argon2id en `control.db`, se borra al usarse). Sin código vigente el setup queda cerrado. Evita que un tercero reclame un negocio recién creado (los subdominios son adivinables y aparecen en los logs públicos de Certificate Transparency). |

### 6.2 Impresión de tickets (sin token de bridge)
- La impresión ocurre **100% en el navegador** vía `window.print()` — no hay servicio externo, WebSocket ni token que proteger.
- *(Histórico: existió un print-bridge WebSocket con token argon2id de 256 bits; se eliminó el 2026-06-12 junto con su superficie de seguridad.)*

### 6.3 Endpoint de descarga de backup
- Verificación de sesión activa **server-side** obligatoria antes de servir el archivo.
- La ruta del archivo la deriva el servidor **solo del negocio resuelto por el Host** (`/app/data/backups/<slug>/latest.db`) — un negocio nunca puede descargar el backup de otro.
- El endpoint **nunca** acepta parámetros del cliente para construir la ruta (previene path traversal · CWE-22).
- Respuesta con header `Content-Disposition: attachment` — nunca inline.
- Rate limit: máximo **5 descargas por hora** por sesión.

### 6.4 Rate limiting (Fastify `@fastify/rate-limit`)
Los contadores se llevan por **negocio + IP** (`keyGenerator` en `app.ts`).

| Endpoint | Límite |
|---|---|
| `POST /auth/login` | 5 intentos por IP cada 15 minutos |
| `POST /auth/recover` | 3 intentos por IP cada 30 minutos |
| `GET /api/settings/backup/download` | 5 descargas por hora por sesión |

### 6.5 CORS
- **Sin CORS.** Cada negocio y el panel llaman a su API en su mismo origen (Caddy en producción, proxy de Vite en desarrollo). Habilitarlo permitiría a otro subdominio de `dosuxsoft.com` leer la API con sesión: es el mismo sitio, así que las cookies `SameSite=Strict` viajan. (Hasta la revisión de 2026-10-07 se autorizaba `www.dosuxsoft.com`.)

### 6.6 Headers de seguridad HTTP (en `Caddyfile`)
```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'
```
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
- Errores internos → loguear con `pino` (nivel `error`) → responder al cliente con mensaje genérico `{ error: { code, message } }`.
- **Nunca** stack traces ni detalles internos en respuestas al cliente (CWE-209).
- Errores tipados del dominio en `server/src/lib/errors.ts` (ej. `CajaYaAbierta`, `UsuarioBloqueado`).

### 6.11 Observabilidad
- Logging estructurado con `pino` (JSON) a la salida estándar → `docker compose logs server`. Docker los rota: 5 archivos de 20 MB (`logging` en `docker-compose.yml`).
- Health check: `GET /health` → estado de `control.db`, entorno y hora.
- Sin Sentry (decisión del usuario) — los logs de pino son la fuente de diagnóstico.

### 6.12 Break-glass (recuperación de emergencia)
- **Riesgo aceptado:** un solo admin + recovery code significa que si se pierden ambos, el sistema queda bloqueado — sin reset por email ni segundo usuario.
- **Mitigación:** script `apps/server/src/scripts/reset-admin.ts <slug>` (compila a `dist/scripts/reset-admin.js`), ejecutable con acceso directo al servidor, que resetea la contraseña del admin **de ese negocio** (genera contraseña temporal + nuevo recovery code, e invalida todas las sesiones del negocio). Construido en la Fase 2; recibe el slug desde la Fase A.
- **Administración de negocios:** normalmente desde el panel `admin.<dominio>` (Fase F). Respaldo por consola: `apps/server/src/scripts/tenant.ts` → `create <slug> "<nombre>"`, `list`, `suspend <slug>`, `activate <slug>`.
- **Superadministradores:** `apps/server/src/scripts/superadmin.ts` → `create <usuario>` (contraseña temporal), `reset`, `disable`, `enable`, `list`. **No hay alta ni recuperación por HTTP**: quien controla el panel controla todos los negocios.
- El script **no es un endpoint** — solo corre con acceso local al servidor, protegido por el acceso SSH por clave. Esa es la red de seguridad ante un bloqueo total.

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
- **Revisar unicidad después de cada `await`:** entre una verificación ("¿existe ya?") y la inserción no puede haber `await` (hash argon2). Calcular los hashes primero y luego verificar e insertar sin pausas; better-sqlite3 es síncrono, así que ese tramo es atómico (setup del dueño, alta de usuarios, alta de negocios).
- El recovery code es solo del dueño; admins y cajeros los restablece un superior desde Usuarios.

### 6.14 Panel de la plataforma (Fase F)
| Decisión | Valor |
|---|---|
| Cuentas | Tabla `superadmins` en `control.db`, argon2id, creadas solo por consola |
| Sesión | Cookie `dosuxsoft_platform` (distinta a la de los negocios, sin `Domain` → solo `admin.`), tabla `platform_sessions`, mismas 8 h / 60 min |
| Login | 5 fallos → bloqueo 15 min por cuenta + rate limit 5/15 min por IP; usuario inexistente = mismo tiempo y mensaje |
| Cambio de contraseña | Cierra todas las sesiones de esa cuenta y abre una nueva para quien la cambió |
| Bitácora | `platform_audit_log` (solo inserción): login, alta, cambios con valor anterior y nuevo, pagos, anulaciones, suspensiones |
| Datos de un negocio | El panel solo lee métricas de uso (cantidad de usuarios, fecha de la última venta). Nunca clientes ni montos del negocio |
| Sin MFA | Igual que el resto del sistema (§10). Mitigación: cuentas solo por consola, bloqueo, bitácora |

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
- **Todos los límites de día/semana/mes** (reportes, "ventas de hoy" por fecha) y el **cron de cierre automático** se computan en `America/Costa_Rica`.
- El corte de caja agrupa ventas por `cash_register_id` (FK), **no por fecha** — inmune al problema de zona horaria.
- El contenedor Docker corre en UTC; la conversión a hora de CR ocurre en la capa de lógica, nunca se asume la TZ del sistema operativo.

### Transacciones SQLite
- Toda operación que toca más de una tabla debe usar `db.transaction()`.
- Especialmente: crear venta + incrementar consecutivo, crear cierre + snapshot.

### Restricción de caja única abierta
- SQLite no soporta índices parciales (`WHERE`) via Drizzle ORM — no es posible un `UNIQUE INDEX ... WHERE closed_at IS NULL`.
- La invariante "solo una caja abierta" se garantiza en el **service layer** de Fase 4: `POST /api/cash-registers/open` consulta si existe una fila con `closed_at IS NULL` dentro de una transacción antes de insertar. SQLite es single-writer — no hay race condition real en este modelo.

### Reglas multi-negocio (Fase A)
- Los repositories importan `db` desde `db/client.ts` como siempre — **nunca** abrir `better-sqlite3` directamente ni guardar una referencia a la BD de un negocio en una variable de módulo.
- **Jobs (node-cron):** envolver la lógica en `forEachActiveTenant(log, 'nombre-job', fn)` (`jobs/for-each-tenant.ts`). Un job que use `db` sin esto lanza error.
- **Scripts CLI:** recibir el slug como argumento y ejecutar dentro de `runWithTenant(slug, fn)`.
- **Rutas sin negocio** (health, tls-check) se declaran en `GLOBAL_PATHS` de `middleware/tenant.ts` y no pueden tocar `db`.
- Rutas a archivos de un negocio: usar `tenantDbPath(slug)` / `tenantBackupDir(slug)` — validan el slug.
- `control.db` guarda el registro de negocios y lo de la plataforma (suscripción, pagos de la mensualidad, superadministradores, tipo de cambio). **Nunca** datos operativos de un negocio.

### Reglas de inventario (Fase C)
- `products.stock` es el saldo de `stock_movements`. **Solo** `applyStockChange(tx, …)` (`modules/products/repository.ts`) lo modifica, siempre dentro de la transacción del llamador y dejando el movimiento con `stock_after`.
- Venta con carrito: el cliente envía `{ productId, quantity }`; **precio y costo salen del catálogo en el servidor** y se copian a `sale_items` (cambiar el precio después no altera ventas pasadas). Líneas libres: `{ description, quantity, unitPrice }`.
- `sales.amount` y `sales.description` se siguen llenando (total y resumen "2× X, Y"): caja, reportes y dashboard no leen `sale_items`.
- Vender sin stock se permite (stock negativo) y se devuelve en `stockWarnings`. Eliminar una venta devuelve el stock (`anulacion_venta`).
- El costo solo se envía a roles con `viewCosts`; el cajero recibe `cost: null`.

### Reglas de perfil del negocio (Fase D)
- `business_profile` (una fila) define plantilla, nombre de las órdenes (`ordersLabel`), qué se recibe (`itemLabel`), campos de la orden y módulos activos. Plantillas en `packages/shared/src/schemas/business.ts` (`TEMPLATE_INFO`).
- **Módulos activables** (`ordenes`, `cotizaciones`, `facturas`, `apartados`, `creditos`, `inventario`): se registran con `registerModuleRoutes` (`middleware/module.ts`) → 404 `MODULO_DESACTIVADO` si están apagados. En el frontend: `requireModule` en `beforeLoad` y `module` en `NAV_ITEMS`. Un módulo nuevo activable debe hacer las tres cosas.
- **Campos de la orden:** `boletas.fields` es JSON `OrderFieldValue[]` con la **etiqueta copiada al crear** la orden: renombrar o borrar un campo no altera órdenes viejas. La clave (`key`) es estable y no cambia al renombrar.
- Validación con `validateOrderFields` (compartida): el frontend la usa para mostrar errores y el servidor para rechazar. Claves fuera del perfil se ignoran.
- Campos tipo `secret` (contraseña del equipo del cliente) van en texto plano, como siempre; **nunca** se copian al `audit_log`.
- El perfil vive en el contexto del router (`useBusiness`); tras guardarlo, `router.invalidate()`.

### Reglas de dólares y avisos (Fase E)
- **Contabilidad en colones.** Los dólares solo se *reciben* (método de pago `dolares`): la venta guarda `amount` en ₡ más `usd_received_cents`, `exchange_rate` (centésimas de ₡) y `change_colones`. El vuelto siempre es en colones.
- Enteros en todo: USD en centavos, tipo de cambio en centésimas. Conversión solo con `usdCentsToColones` (`packages/shared/src/money.ts`). El único decimal→entero es al leer el BCCR (`lib/bccr.ts`).
- **El tipo de cambio lo decide el servidor** al cobrar (`getExchangeRateInfo`, `lib/exchange-rate.ts`): compra BCCR (317) si es de los últimos 4 días; si no, el de respaldo `usd_manual_rate` del negocio; si no hay, 400 `TIPO_CAMBIO_NO_DISPONIBLE`.
- BCCR: API SDDE (`apim.bccr.fi.cr`, token Bearer en `BCCR_API_TOKEN`, uno para toda la plataforma). Tabla `exchange_rates` en `control.db` (global). Job horario `jobs/exchange-rate.ts`, no por negocio.
- **Avisos por WhatsApp:** enlaces `wa.me/506XXXXXXXX?text=…` (`whatsappLink`), la persona toca Enviar. Plantillas en settings `msg_*` (vacío = `DEFAULT_MESSAGES`). Cada aviso abierto queda en `customer_notifications` (solo inserción). No hay envío automático.

### Reglas de la plataforma (Fase F)
- **Alta solo desde el panel** (o `tenant create`): no hay registro público.
- **Cobro manual:** el superadministrador registra cada pago (SINPE / transferencia). `tenants.paid_until` es el último día cubierto (YYYY-MM-DD, calendario de CR); NULL = sin cobro. Un pago extiende **desde el vencimiento actual aunque ya pasó** (`addMonths`, compartido). Los pagos no se borran: se anulan, y anular el último pago devuelve el vencimiento (`previous_paid_until`) si nadie lo corrigió después.
- **Un atraso nunca bloquea.** Estado derivado con `subscriptionStatus` (compartido): `al_dia`, `por_vencer` (≤ 5 días), `vencido`, `sin_cobro`. El dueño y los admins ven un aviso; suspender es manual desde el panel.
- Precio: `monthly_price` del negocio o, si es NULL, `default_monthly_price` de `platform_settings`.
- Las tablas de `control.db` se crean con `CREATE TABLE IF NOT EXISTS` y columnas nuevas con `ALTER TABLE` condicional en `db/control.ts` (no usa las migraciones de Drizzle). Todo lo que escribe más de una tabla usa `controlTransaction`.
- El enrutado del panel en el frontend es un enrutador mínimo propio (`features/platform/router.tsx`), para no mezclar un segundo árbol de TanStack Router con los tipos de la app de los negocios.

### Regla de migraciones
- Antes de aplicar migraciones pendientes a un negocio con datos, `openTenantDb` guarda `backups/<slug>/pre-migracion-<fecha>.db` (fuera de la rotación). Test: `src/tests/migrations.test.ts` (incluye subir una BD en el estado de producción, 0006, hasta la última).
- Migraciones a mano: agregarlas al `_journal.json` con `when` **mayor que la anterior**. Drizzle salta las que tengan `when` menor que la última aplicada (lo encontró el test de la migración 0009 al agregar la 0010).

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

Definidas en `.env` (nunca en el repositorio).
Producción: `deploy/.env` (lo lee Docker Compose; ver `deploy/.env.example`). Desarrollo: `apps/server/.env`, opcional, cargado por `pnpm dev` con `--env-file-if-exists` (ver `apps/server/.env.example`).
No hay secretos que generar: las sesiones son tokens aleatorios con hash en BD y la cookie no se firma (`SESSION_SECRET` y `ALLOWED_ORIGIN` se eliminaron el 2026-10-07; si siguen en un `.env` se ignoran).

| Variable | Descripción |
|---|---|
| `DATA_DIR` | Directorio de datos: `control.db`, `tenants/<slug>.db`, `backups/<slug>/` (default: `./data`; prod: `/app/data`) |
| `TENANT_BASE_DOMAIN` | Dominio base de los negocios (default: `localhost`; prod: `dosuxsoft.com`) |
| `DEV_TENANT` | Solo desarrollo: negocio para `localhost` sin subdominio (opcional) |
| `BCCR_API_TOKEN` | Token Bearer del API SDDE del BCCR para el tipo de cambio (opcional; sin él rige el respaldo manual de cada negocio) |
| `PORT` | Puerto del servidor Fastify (default: `3000`) |
| `NODE_ENV` | `development` o `production` |

---

## 9. Estructura de Carpetas

```
apps/server/src/   db/ (schema, migraciones, control.ts, client.ts, seed) · jobs/ · lib/ · middleware/
                   modules/<modulo>/ (routes, service, repository) · scripts/ (tenant, superadmin, reset-admin)
                   tests/ (integración) · db/tests/ (schema)
apps/web/src/      features/<modulo>/ · routes/ (TanStack Router) · components/ · app/layout/ · lib/
packages/shared/   src/schemas/<modulo>.ts · src/money.ts
deploy/            docker-compose.yml · Caddyfile · backup.sh · DEPLOY.md · ACTUALIZAR-VPS.md · .env.example
Dockerfile         multi-stage: build → server + caddy
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
| 2026-10-07 | Revisión general | Limpieza y correcciones antes de producción. **Seguridad/configuración:** quitado CORS (autorizaba a `www.dosuxsoft.com` a leer la API de los negocios con sesión, porque las cookies `SameSite=Strict` viajan entre subdominios del mismo sitio) y la variable sin uso `SESSION_SECRET`; quitado `LOG_PATH` (los logs nunca fueron a archivo) y la rotación pasó a Docker (5 × 20 MB) para no llenar el disco. **Bug:** el panel marcaba "Sin activar" a un negocio migrado de la versión anterior (miraba el código de activación pendiente); ahora mira si la BD tiene usuarios (test nuevo). **Frontend:** 12 errores de lint corregidos (incluidos 3 `setState` dentro de `useEffect`: al encontrar un cliente por teléfono ya no se sobrescribe el nombre corregido en cada consulta); la animación del login y Recharts se cargan aparte (bundle inicial de 345 a 184 KB gzip) con un `SalesBarChart` compartido por dashboard y reportes; error en consola de la animación del login (elipses sin valor inicial); etiquetas de métodos de pago desde `PAYMENT_METHOD_LABELS`; `og-image.png` con el monograma DS (era el logo viejo de SIPNATO); descripción de `index.html` multi-negocio; Vite en el puerto 5174. **Eliminado:** código sin uso (3 errores, 5 funciones de repositorio, `parseColones`, esquemas y tipos sin referencias), dependencias `pino` y `@fastify/cors` (`tsx` pasó a desarrollo), favicons con el logo viejo, carpetas vacías con `.gitkeep`, `.env.example` de la raíz (ahora `apps/server/.env.example`). **Datos:** la BD de desarrollo se vació (solo había datos de prueba). **Docs:** README, PRODUCT.md, DEPLOY.md (migración de la BD anterior corregida, backups de `_control`, checklist) y ACTUALIZAR-VPS.md reescritos para la versión multi-negocio. 85/85 tests. |
| 2026-10-07 | `/grill-me` A–F | Revisión técnica del backend de las Fases A–F. Verificado sin cambios: todas las rutas de negocio exigen sesión; cancelar/anular restringido a dueño/admin y eliminar ventas/gastos con autorización; el `audit_log` de órdenes no guarda valores de campos (contraseñas de clientes); el puerto 3000 no se publica (solo Caddy); `env_file` pasa `BCCR_API_TOKEN`. **Corregido:** (1) `control.db` no se respaldaba (desde la Fase F guarda pagos, precios y cuentas del panel) → respaldo diario en `backups/_control/`, que `backup.sh` ya copia. (2) Carreras entre verificación y escritura separadas por `await` (setup del dueño → 500 en vez de 409; alta de usuarios y de negocios duplicados) → hashes primero, verificación e inserción sin pausas. (3) Sin copia antes de migrar → `pre-migracion-*.db` por negocio con migraciones pendientes; test nuevo `src/tests/migrations.test.ts` que además sube una BD en el estado de producción (0006) hasta la 0010. (4) El aviso de vencimiento tardaba hasta 1 h en irse tras un pago → 10 min. Decisión del usuario: cotizaciones y notas siguen pudiéndose borrar por cualquier rol. 84/84 tests. |
| 2026-10-07 | Fase F | **Panel de la plataforma y cobro de la mensualidad.** Decisiones del usuario: alta de negocios solo desde el panel; cobro manual por SINPE/transferencia; un atraso solo genera avisos; un plan con precio por defecto y precio especial por negocio. `control.db`: columnas de contacto/precio/vencimiento en `tenants`, tablas `superadmins`, `platform_sessions`, `subscription_payments`, `platform_settings`, `platform_audit_log`. Backend: `modules/platform/` (NUEVO: sesión del superadministrador con bloqueo, alta con BD y código de activación, datos y vencimiento auditados, pagos y anulaciones, suspensión, configuración de cobro), `middleware/platform-auth.ts` (NUEVO), subdominio `admin` aislado en `middleware/tenant.ts`, `modules/subscription/` (NUEVO: `/api/subscription` para dueño y admins), `scripts/superadmin.ts` (NUEVO), tls-check acepta `admin.`, limpieza diaria de sesiones del panel. Shared: `schemas/platform.ts` (NUEVO: validación del subdominio movida aquí, `addMonths`, `subscriptionStatus`, esquemas y tipos del panel). Frontend: `features/platform/` (NUEVO: login, negocios con resumen de cobros y filtros, alta con código enviable por WhatsApp, detalle con pagos/recordatorio/datos/acceso/actividad, configuración), `features/subscription/` (NUEVO: aviso de vencimiento en el layout y sección en Configuración). Deploy: Caddy enruta `/platform/*`; DEPLOY.md con la cuenta del panel. Tests: `src/tests/platform.test.ts` (NUEVO, 16 casos); 82/82 pasan. Verificado en navegador: login, configuración de cobro, alta de negocio con subdominio sugerido, activación con el código, aviso "vence el 09 oct" en el negocio, recordatorio y pago de 3 meses que corre el vencimiento al 09 ene 2027, vista de celular y modo oscuro. |
| 2026-10-07 | Fase E | **Cobro en dólares y avisos a clientes por WhatsApp.** Decisiones del usuario: cobrar en USD con contabilidad en colones; tipo de cambio automático del BCCR; avisos por WhatsApp que la persona envía con un toque; avisos de orden recibida/lista, cobro de créditos, abono registrado y cotización. DB: migración `0010_dolares_avisos.sql` (campos USD en `sales`, totales USD en el cierre de `cash_registers`, tabla `customer_notifications`); `exchange_rates` en `control.db`. Backend: `lib/bccr.ts` (NUEVO: cliente API SDDE, compra 317/venta 318), `jobs/exchange-rate.ts` (NUEVO: consulta horaria global), `lib/exchange-rate.ts` (NUEVO: compra BCCR reciente o respaldo manual), método de pago `dolares` con conversión y vuelto calculados en el servidor, totales de caja con dólares en caja y vueltos, reportes y dashboard con dólares, `/api/exchange-rate` y `/api/notifications` (NUEVOS), settings `usd_manual_rate` y plantillas `msg_*`. Shared: utilidades USD en `money.ts`, `schemas/notifications.ts` (NUEVO: plantillas, `renderMessage`, `whatsappLink`). Frontend: botón "Dólares" y diálogo de cobro en USD en el POS, dólares en caja y arqueo, Configuración con tipo de cambio y editor de mensajes, `WhatsAppNotify` + historial en órdenes (comprobante / listo para retirar), créditos (recordar cobro, comprobante de abono), apartados (comprobante de abono) y cotizaciones. **Bugs previos corregidos:** fechas sin hora (vencimiento de créditos) se mostraban un día antes y un crédito figuraba vencido el mismo día de su vencimiento. Tests: `src/tests/currency.test.ts` (NUEVO, 11 casos, incluye el cliente BCCR con respuestas simuladas); 66/66 pasan. Verificado en navegador: respaldo de ₡505.50, cobro de ₡8,000 con $20 → vuelto ₡2,110, caja con $20.00 en dólares, aviso por WhatsApp con mensaje y número correctos y su historial. |
| 2026-10-07 | Fase D | **Plantillas por tipo de negocio y órdenes de servicio configurables.** Decisiones del usuario: 5 plantillas (celulares, electrónica, taller mecánico, tienda sin servicio técnico, genérico); campos editables por el dueño; sin estados en las órdenes; módulos propuestos por la plantilla y ajustables por el dueño. DB: migración `0009_perfil_negocio.sql` (tabla `business_profile` con perfil "celulares" para todo negocio existente; `boletas.fields` JSON; IMEI y contraseña de las boletas existentes migrados a `fields`; columnas `imei`/`unlock_password` e índice eliminados). Backend: `modules/business/` (NUEVO: GET para todos, PUT solo dueño, auditado), `middleware/module.ts` (NUEVO: `registerModuleRoutes`, 404 `MODULO_DESACTIVADO`), boletas validan `fields` contra el perfil y buscan en ellos (placa, serie, IMEI...), setup aplica la plantilla elegida. Shared: `schemas/business.ts` (NUEVO: plantillas, `validateOrderFields`, `fieldKeyFromLabel`; `validateImei` movido aquí). Frontend: perfil en el contexto del router (`useBusiness`, `requireModule`), menú filtrado por módulos y con el nombre de las órdenes del negocio, formulario de orden generado desde el perfil (texto, número, lista, IMEI, contraseña del cliente con aviso), editor en Configuración (plantillas con confirmación inline, nombres, campos con orden/tipo/obligatorio/opciones, módulos), setup con tipo de negocio, dashboard y POS respetan módulos, textos genéricos ("negocio" en vez de "taller"). Tests: `src/tests/business.test.ts` (NUEVO, 8 casos incluida la migración con boletas del formato anterior); 55/55 pasan. Verificado en navegador: cambio a plantilla de taller, menú actualizado sin recargar, módulo apagado bloqueado, orden con validación de placa y kilometraje. |
| 2026-10-07 | Fase C | **Inventario / catálogo integrado al POS.** Decisiones del usuario: carrito con varios productos + líneas libres; vender sin stock avisa y permite; entradas y ajustes simples con motivo; admin/dueño gestionan, el cajero consulta. DB: migración `0008_inventario.sql` (`products` con código único parcial y `track_stock` para servicios, `stock_movements` como historial con `stock_after`, `sale_items` con precio y costo copiados). Backend: `modules/products/` (NUEVO: listado con filtros activos/stock bajo/desactivados, lookup por código para lectores de barras, CRUD, entradas que actualizan el costo al de la última compra, ajustes por conteo con motivo obligatorio calculados dentro de la transacción, historial), `applyStockChange` como único punto que toca el stock; ventas: precio desde el catálogo, descuento de stock en la transacción de la venta, `stockWarnings`, devolución de stock al eliminar, descripción resumen automática, líneas en el listado. Venta de monto libre sin cambios. Permisos `manageInventory`/`viewCosts`; costos ocultos para el cajero. Frontend: pantalla Inventario (lista densa, filtros, alta inline, fila expandible con edición, "Llegó mercadería"/"Corregir conteo" e historial), POS con buscador/escáner y carrito con cantidades y aviso de stock, ticket impreso con líneas. **Bug encontrado y corregido:** fechas con default `datetime('now')` (UTC sin `Z`) se mostraban 6 h corridas; regla añadida en §7. Tests: `src/tests/inventory.test.ts` (NUEVO, 11 casos); 47/47 pasan. Verificado en navegador: escaneo, búsqueda, carrito con aviso de stock, línea libre, cobro SINPE, stock y costos por rol, entrada con historial. |
| 2026-10-07 | Fase B | **Multiusuario con roles dueño/admin/cajero.** Decisiones del usuario: cajero vende, abre/cierra caja y ve reportes; eliminar ventas/gastos requiere autorización de admin/dueño; no cancela créditos/apartados; login con PIN de 6 dígitos para cajeros; admin gestiona cajeros, solo el dueño gestiona admins, configuración y backups; el PIN compartido de borrado se elimina. DB: migración `0007_usuarios.sql` (tabla `users`, el admin existente pasa a ser el dueño con usuario `dueno`, se elimina `admin`, `sessions` recreada con `user_id`, `audit_log.user_id`, se borra `sales_delete_pin_hash`). Backend: `modules/users/` (NUEVO: CRUD con reglas de jerarquía, `verifyCredentials` con bloqueo 5 intentos/15 min, `verifySupervisor`, cambio de secreto propio), `middleware/authorization.ts` (NUEVO: `authorizeOrEscalate`), `requireRole`, actor en el contexto ALS (`setActor`/`currentActorId`) y `userId` en las 23 inserciones de audit_log, `/auth/me` devuelve el usuario, recover devuelve el usuario del dueño, cancelar/anular restringido a admin/dueño, settings PUT y backup solo dueño. Shared: schemas de usuarios + matriz `PERMISSIONS`. Frontend: pantalla Usuarios (lista + alta/restablecer inline), Mi cuenta (cambiar contraseña/PIN), `SupervisorAuthDialog` en POS y Gastos (reemplaza el modal de PIN), sidebar filtrado por rol + bloque del usuario actual, login con usuario, setup con nombre/usuario del dueño, botones de cancelar/anular ocultos sin permiso, guards de ruta. Tests: `src/tests/users.test.ts` (NUEVO, 14 casos); 36/36 pasan. Verificado en navegador con la BD de desarrollo migrada (admin → dueño) y un flujo real de cajera eliminando con autorización. |
| 2026-10-07 | Fase A | **Multi-negocio con BD separada por negocio.** Backend: `db/control.ts` (NUEVO — `control.db` con tabla `tenants`: slug/nombre/estado, validación de slug como label DNS + reservados), `db/client.ts` reescrito (caché de conexiones por negocio, migraciones + bootstrap al primer `openTenantDb`, `AsyncLocalStorage` con `runWithTenant`, `db` como proxy que falla cerrado fuera de contexto), `middleware/tenant.ts` (NUEVO — hook `onRequest` Host → slug → 404/403/contexto), rate limit por negocio+IP, `/internal/tls-check` para on-demand TLS de Caddy, `/health` sobre `control.db`. Jobs (`auto-close`, `backup`, `cleanup-sessions`) recorren negocios activos vía `jobs/for-each-tenant.ts` (NUEVO); backups en `backups/<slug>/`. Descarga de backup derivada del negocio del request. Scripts: `scripts/tenant.ts` (NUEVO: create/list/suspend/activate), `reset-admin.ts <slug>`, `seed.ts [slug]`. Env: `DATABASE_PATH`/`BACKUP_PATH` → `DATA_DIR` + `TENANT_BASE_DOMAIN` + `DEV_TENANT`. Script `db:migrate` eliminado (las migraciones son por negocio). **Código de activación de un solo uso** para `/auth/setup` (hallazgo de la revisión de seguridad: sin él, quien llegara primero al subdominio de un negocio nuevo podía reclamar su admin) — columna `setup_code_hash` en `control.db`, `tenant setup-code <slug>`, campo en el formulario de setup. Tests: `src/tests/tenancy.test.ts` (NUEVO — 14 casos: BD separada, sesión/contraseña/datos no cruzan, código de activación propio y de un solo uso, 404/403, hosts maliciosos, tls-check, backup por negocio, falla cerrado); 22/22 pasan. Frontend: pantalla `/no-disponible` (negocio inexistente/suspendido) + `features/auth/tenant-guard.ts`. Deploy: Caddyfile `*.dosuxsoft.com` con on-demand TLS, apex/www como placeholder, compose con nuevas env, `backup.sh` por negocio, DEPLOY.md (DNS comodín en Cloudflare "Solo DNS", crear negocios, migrar BD anterior). **Bugs previos encontrados y corregidos:** (1) `login.tsx`/`setup.tsx` detectaban redirects con `'_isRedirect' in e`, propiedad que ya no existe en TanStack Router 1.170 (los redirects son `Response` con `.options`) → el redirect a `/setup` se perdía y un sistema sin admin mostraba "Iniciar sesión" (el síntoma visto en producción en agosto); ahora usan `isRedirect` de la librería. (2) Un `apps/web/vite.config.js` generado por `tsc -b` el 2026-06-12 (ignorado por git) tenía prioridad sobre `vite.config.ts` en desarrollo: ningún cambio de config de Vite desde esa fecha se aplicaba localmente (incluido el fix de framer-motion); `tsconfig.node.json` ahora emite a `node_modules/.tmp`. (3) Proxy de Vite con `changeOrigin: false` para conservar el subdominio. IVA/Hacienda descartados definitivamente. |
| 2026-06-17 | Docs | **`DATABASE_PATH` default en CLAUDE.md corregido** — `sipnato.db` → `dosuxsoft.db`. Regla de alias en subqueries Drizzle añadida a Sección 7. Diagnóstico de BD en `deploy/ACTUALIZAR-VPS.md` corregido: el comando `node -e` debe ejecutarse desde `/app/apps/server` (pnpm workspace instala `better-sqlite3` allí, no en `/app`). |
