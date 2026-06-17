# CLAUDE.md — Biblia del Proyecto SIPNATO POS

> Este archivo es la fuente de verdad del proyecto. Se actualiza al finalizar cada fase.
> Última actualización: 2026-06-17 · Estado: **COMPLETO** + módulo Créditos · Apartados desactivado del sidebar · bug de subquery Drizzle corregido ✅

---

## 1. Identidad del Proyecto

| Campo | Valor |
|---|---|
| Nombre | SIPNATO POS |
| Propósito | Sistema POS para taller de reparación de celulares y venta de accesorios |
| País / Zona horaria | Costa Rica · `America/Costa_Rica` |
| Moneda | Colones costarricenses (₡) únicamente |
| Usuario operativo | Un solo administrador |
| Tipo de sistema | Aplicación web privada detrás de login, accesible vía subdominio HTTPS |

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
| pino | Logging estructurado |
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
| Base de datos | SQLite · archivo único · WAL mode |
| Respaldo | backup diario interno (better-sqlite3 backup API) · rotación 30 días |

---

## 4. Arquitectura

```
[Navegador — SPA React] ──window.print()──► Ticketera 80mm (Epson predeterminada)
        │ HTTPS (Caddy)
        ▼
   API Fastify ──── node-cron (cierre auto + backup diario)
        │
        ▼
   SQLite /app/data/sipnato.db  +  /app/data/backups/
```

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
| `BRAND/*.jpg` (monograma DS) | Logo principal en sidebar/topbar y favicon · copiado a `web/public/logo.jpg` |
| `web/public/favicon.svg` + `favicon.ico` | Favicons fallback (declarados en `index.html`) |
| `web/public/og-image.png` | Open Graph / Twitter meta tags |

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
| Al cambiar contraseña | Invalidar **todas** las filas de `sessions` del usuario |
| Recovery code | Generado con `crypto.randomBytes(16).toString('hex')` · mostrado UNA vez · almacenado hasheado con argon2id · invalidado al usarse (genera uno nuevo) |

### 6.2 Impresión de tickets (sin token de bridge)
- La impresión ocurre **100% en el navegador** vía `window.print()` — no hay servicio externo, WebSocket ni token que proteger.
- *(Histórico: existió un print-bridge WebSocket con token argon2id de 256 bits; se eliminó el 2026-06-12 junto con su superficie de seguridad.)*

### 6.3 Endpoint de descarga de backup
- Verificación de sesión activa **server-side** obligatoria antes de servir el archivo.
- La ruta del archivo está **hardcodeada** en el servidor (`/app/data/backups/sipnato-latest.db`).
- El endpoint **nunca** acepta parámetros del cliente para construir la ruta (previene path traversal · CWE-22).
- Respuesta con header `Content-Disposition: attachment` — nunca inline.
- Rate limit: máximo **5 descargas por hora** por sesión.

### 6.4 Rate limiting (Fastify `@fastify/rate-limit`)
| Endpoint | Límite |
|---|---|
| `POST /auth/login` | 5 intentos por IP cada 15 minutos |
| `POST /auth/recover` | 3 intentos por IP cada 30 minutos |
| `GET /api/settings/backup/download` | 5 descargas por hora por sesión |

### 6.5 CORS
- Configuración: `origin: ['https://<tu-subdominio>']` — **nunca `*`** en endpoints autenticados.
- Configurar en Fastify con `@fastify/cors`.

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
- Errores tipados del dominio en `server/src/lib/errors.ts` (ej. `CajaYaAbierta`, `SesionExpirada`).

### 6.11 Observabilidad
- Logging estructurado con `pino` → archivo rotado diariamente en `/app/logs/`.
- Health check: `GET /health` → retorna estado de la BD, último backup, uptime.
- Sin Sentry (decisión del usuario) — los logs de pino son la fuente de diagnóstico.

### 6.12 Break-glass (recuperación de emergencia)
- **Riesgo aceptado:** un solo admin + recovery code significa que si se pierden ambos, el sistema queda bloqueado — sin reset por email ni segundo usuario.
- **Mitigación:** script `apps/server/src/scripts/reset-admin.ts` (compila a `dist/scripts/reset-admin.js`), ejecutable por SSH directamente en el VPS, que resetea la contraseña del admin en la BD (genera contraseña temporal + nuevo recovery code, e invalida todas las sesiones). Construido en la Fase 2.
- El script **no es un endpoint** — solo corre con acceso local al servidor, protegido por el acceso SSH por clave. Esa es la red de seguridad ante un bloqueo total.

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
- **Todos los límites de día/semana/mes** (reportes, "ventas de hoy" por fecha) y el **cron de cierre automático** se computan en `America/Costa_Rica`.
- El corte de caja agrupa ventas por `cash_register_id` (FK), **no por fecha** — inmune al problema de zona horaria.
- El contenedor Docker corre en UTC; la conversión a hora de CR ocurre en la capa de lógica, nunca se asume la TZ del sistema operativo.

### Transacciones SQLite
- Toda operación que toca más de una tabla debe usar `db.transaction()`.
- Especialmente: crear venta + incrementar consecutivo, crear cierre + snapshot.

### Restricción de caja única abierta
- SQLite no soporta índices parciales (`WHERE`) via Drizzle ORM — no es posible un `UNIQUE INDEX ... WHERE closed_at IS NULL`.
- La invariante "solo una caja abierta" se garantiza en el **service layer** de Fase 4: `POST /api/cash-registers/open` consulta si existe una fila con `closed_at IS NULL` dentro de una transacción antes de insertar. SQLite es single-writer — no hay race condition real en este modelo.

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

Definidas en `.env` (nunca en el repositorio). Ver `.env.example` para estructura.

| Variable | Descripción |
|---|---|
| `SESSION_SECRET` | Secret para firmar cookies de sesión (min 64 chars, random) |
| `DATABASE_PATH` | Ruta absoluta al archivo SQLite (default: `/app/data/dosuxsoft.db`) |
| `BACKUP_PATH` | Ruta absoluta al directorio de backups (default: `/app/data/backups/`) |
| `LOG_PATH` | Ruta absoluta al directorio de logs (default: `/app/logs/`) |
| `PORT` | Puerto del servidor Fastify (default: `3000`) |
| `ALLOWED_ORIGIN` | Origen CORS permitido — **`https://www.sipnato.com`** |
| `NODE_ENV` | `development` o `production` |

---

## 9. Estructura de Carpetas (Aprobada)

Ver sección 7 del spec de diseño en `docs/superpowers/specs/2026-06-09-sipnato-pos-design.md`.
La estructura está fijada y aprobada — no modificar sin actualizar este archivo.

---

## 10. Fuera de Alcance (Explícito y Definitivo)

- Facturación electrónica de Hacienda (Costa Rica)
- Inventario / catálogo de productos / control de stock
- Multi-usuario, roles y permisos
- Multi-moneda
- Estados de workflow y abonos en boletas
- Notificaciones automáticas a clientes (WhatsApp/SMS/correo)
- Multi-sucursal
- MFA / TOTP
- Staging environment (sistema personal)

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
| 2026-06-17 | Docs | **`DATABASE_PATH` default en CLAUDE.md corregido** — `sipnato.db` → `dosuxsoft.db`. Regla de alias en subqueries Drizzle añadida a Sección 7. Diagnóstico de BD en `deploy/ACTUALIZAR-VPS.md` corregido: el comando `node -e` debe ejecutarse desde `/app/apps/server` (pnpm workspace instala `better-sqlite3` allí, no en `/app`). |
