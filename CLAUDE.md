# CLAUDE.md — Biblia del Proyecto SIPNATO POS

> Este archivo es la fuente de verdad del proyecto. Se actualiza al finalizar cada fase.
> Última actualización: 2026-06-10 · Fase actual: Fase 3 — Branding & Configuración Base

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

### `apps/print-bridge` — Servicio local de impresión
| Herramienta | Propósito |
|---|---|
| Node.js | Runtime |
| ws | Cliente WebSocket con reconexión |
| node-escpos / escpos-usb | Comunicación ESC/POS con ticketera 80mm |

> **Impresora objetivo:** Epson TM-T20 / TM-T88 (ESC/POS estándar, soporte impecable en Node). Validada con un spike temprano (Fase 0.5) antes de construir el módulo completo en la Fase 12. Codificación a verificar: CP858/PC858 para tildes, ñ y el símbolo ₡.

### `packages/shared` — Contrato común
| Contenido | Propósito |
|---|---|
| `schemas/` | DTOs zod usados por frontend Y backend |
| `tickets/` | Tipos de payload + render ESC/POS + preview HTML |
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
[Navegador — SPA React]
        │ HTTPS (Caddy)
        ▼
   API Fastify ──── node-cron (cierre auto + backup diario)
        │
        ▼
   SQLite /app/data/sipnato.db  +  /app/data/backups/
        ▲
        │ WebSocket (token hash 256-bit)
[PC del taller] print-bridge ──ESC/POS──► Ticketera 80mm
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
| `BRAND/LOGO SVG.svg` | Logo en sidebar, topbar · copiado a `web/public/favicon.svg` |
| `BRAND/SIPNATO-LOGO.ico` | Favicon fallback · copiado a `web/public/favicon.ico` |
| `BRAND/SIPNATO LOGO.png` | Open Graph / Twitter meta tags · copiado a `web/public/og-image.png` |

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

### 6.2 Print-bridge token
- Generado con `crypto.randomBytes(32).toString('hex')` (256 bits de entropía).
- Almacenado **hasheado** (argon2id) en la BD, en tabla `settings`.
- Mostrado UNA sola vez en Configuración al generarlo.
- WebSocket valida el token en el handshake (header `Authorization: Bearer <token>`).
- El bridge solo puede recibir trabajos de impresión y enviar ACK — sin acceso a ningún dato de negocio.

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
| WebSocket print-bridge | 3 reconexiones fallidas por minuto → blacklist temporal de IP |

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
- **Mitigación:** script `apps/server/scripts/reset-admin.ts`, ejecutable por SSH directamente en el VPS, que resetea la contraseña del admin en la BD (genera contraseña temporal + nuevo recovery code, e invalida todas las sesiones). Construido en la Fase 2.
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

---

## 8. Variables de Entorno

Definidas en `.env` (nunca en el repositorio). Ver `.env.example` para estructura.

| Variable | Descripción |
|---|---|
| `SESSION_SECRET` | Secret para firmar cookies de sesión (min 64 chars, random) |
| `PRINT_BRIDGE_TOKEN_HASH` | Hash argon2id del token del puente de impresión |
| `DATABASE_PATH` | Ruta absoluta al archivo SQLite (default: `/app/data/sipnato.db`) |
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
