# ROADMAP — SIPNATO POS

> Desarrollo por fases pequeñas y lógicas. Cada fase es atómica: una sola responsabilidad, verificable antes de avanzar.
> Al completar cada fase: marcar `[x]`, anotar la fecha y actualizar `CLAUDE.md`.
> Última actualización: 2026-06-13 · Todas las fases ✅ + polish post-lanzamiento (logo, animaciones, personaje login)

---

## Estado general

| Fase | Nombre | Estado |
|---|---|---|
| 0 | Monorepo & Tooling | ✅ COMPLETADA 2026-06-10 |
| 0.5 | Spike de Impresión (validación de hardware) | ⏭ Omitida — superada por impresión vía navegador |
| 1 | Schema de BD & Migraciones | ✅ COMPLETADA 2026-06-10 |
| 2 | Auth & Seguridad | ✅ COMPLETADA 2026-06-10 |
| 3 | Branding & Configuración Base | ✅ COMPLETADA 2026-06-10 |
| 4 | Control de Caja | ✅ COMPLETADA 2026-06-10 |
| 5 | Módulo POS (Ventas) | ✅ COMPLETADA 2026-06-10 |
| 6 | Módulo de Gastos | ✅ COMPLETADA 2026-06-10 |
| 7 | Base de Datos de Clientes & Boletas | ✅ COMPLETADA 2026-06-10 |
| 8 | Cotizaciones | ✅ COMPLETADA 2026-06-10 |
| 9 | Notas Internas | ✅ COMPLETADA 2026-06-10 |
| 10 | Reporte de Ventas | ✅ COMPLETADA 2026-06-11 |
| 11 | Dashboard | ✅ COMPLETADA 2026-06-11 |
| 12 | Impresión de Tickets (vía navegador) | ✅ COMPLETADA 2026-06-12 — reemplazó al print-bridge WebSocket |
| 13 | Despliegue (VPS + Docker + Caddy) | ✅ COMPLETADA 2026-06-11 |
| 14 | Módulo de Apartados (layaway) | ✅ COMPLETADA 2026-06-12 |
| — | Polish post-lanzamiento (UI/branding) | ✅ 2026-06-13 |

---

## Fase 0 — Monorepo & Tooling

**Objetivo:** proyecto compila, lintea y corre en desarrollo. Sin lógica de negocio aún.

### Tareas
- [ ] Inicializar monorepo con `pnpm-workspace.yaml`
- [ ] Configurar `tsconfig.base.json` compartido
- [ ] Configurar ESLint + Prettier en todos los workspaces
- [ ] Crear `apps/web` con Vite + React + Tailwind v4
- [ ] Crear `apps/server` con Fastify + estructura de carpetas vacía
- [ ] Crear `apps/print-bridge` con estructura de carpetas vacía
- [ ] Crear `packages/shared` con estructura de carpetas vacía
- [ ] Configurar `paths` de TypeScript para imports de `shared` en web y server
- [ ] Crear `.env.example` con todas las variables (sin valores reales)
- [ ] Verificar que `pnpm dev` levanta web y server en paralelo

### Checklist de seguridad (Fase 0)
- [ ] `.env` en `.gitignore` — confirmado
- [ ] `.env.example` sin ningún valor secreto real ni de prueba reconocible
- [ ] `NODE_ENV` diferencia comportamiento de logs (pretty en dev, JSON en prod)

### Criterio de completitud
`pnpm dev` levanta la SPA en `localhost:5173` y la API en `localhost:3000/health` respondiendo `{ status: "ok" }`.

**✅ COMPLETADA 2026-06-10** — Verificado: `GET localhost:3000/health` → `{ status: "ok", env: "development" }`. Vite arranca en `localhost:5173`. TypeScript compila sin errores. Nativos `argon2` y `better-sqlite3` compilados con MSVC. Invocar `/grill-me` antes de avanzar a Fase 0.5.

---

## Fase 0.5 — Spike de Impresión (Validación de Hardware)

**Objetivo:** validar que podemos imprimir un ticket real en la Epson TM-T20/T88 vía ESC/POS desde Node ANTES de construir 11 fases sobre esa suposición. Es un spike de validación — código desechable, no producción.

> **Por qué existe esta fase:** el puente de impresión (Fase 12) es la pieza más frágil del sistema y depende de hardware físico. Descubrir un problema de compatibilidad ahora cuesta una tarde; descubrirlo en la Fase 12 cuesta semanas de trabajo construidas sobre arena.

### Tareas
- [ ] Confirmar conexión de la impresora (USB / red) y modelo exacto
- [ ] Prueba mínima en Node con la librería ESC/POS elegida (`node-escpos` + `escpos-usb`): imprimir un ticket de ejemplo de 80mm con encabezado, líneas, total y corte de papel
- [ ] Validar caracteres en español (tildes, ñ, símbolo ₡) — codificación correcta (CP858/PC858 u otra del modelo)
- [ ] Validar el comando de corte de papel (y apertura de cajón si aplica)
- [ ] Documentar en el README del print-bridge: modelo, conexión, codificación y librería que funcionaron

### Criterio de completitud
Un ticket de prueba sale impreso correctamente de la impresora física, con español legible y corte de papel.

**⏭ OMITIDA PROVISIONALMENTE 2026-06-10** — Impresora física no disponible. Se retoma al inicio de la Fase 12 antes de construir el print-bridge completo. *(Spike — sin `/grill-me`, no es backend de producción.)*

---

## Fase 1 — Schema de BD & Migraciones

**Objetivo:** todas las tablas definidas en Drizzle, migradas y probadas con seed de datos.

### Tareas
- [ ] Configurar `better-sqlite3` con WAL mode (`PRAGMA journal_mode=WAL`)
- [ ] Definir schema Drizzle completo (tablas del dominio):
  - `admin` — hash contraseña + hash recovery code
  - `sessions` — token_hash, user_id, expires_at, last_active_at
  - `settings` — clave/valor (datos taller, leyendas, config cierre auto)
  - `cash_registers` — apertura, cierre, tipo cierre, snapshot totales
  - `sales` — descripción opcional, monto INTEGER, método pago, caja FK, consecutivo, **deleted_at**
  - `expenses` — descripción, monto INTEGER, caja FK, **deleted_at**
  - `customers` — nombre, celular (índice), correo/dirección/cédula opcionales
  - `boletas` — cliente FK, modelo, IMEI (validado), contraseña desbloqueo, descripción, consecutivo
  - `quotes` — consecutivo, total INTEGER, created_at
  - `quote_items` — quote FK, descripción, monto INTEGER
  - `notes` — título, texto, created_at, updated_at
  - `counters` — tipo documento, valor actual (incremento transaccional)
  - `audit_log` — action, entity_type, entity_id, payload_snapshot JSON, ip, user_agent, created_at
- [ ] Generar y aplicar migración inicial con `drizzle-kit migrate`
- [ ] Crear seed de datos de prueba (dev únicamente)
- [ ] Escribir tests: consecutivos sin huecos bajo concurrencia, soft-delete no aparece en queries normales
- [ ] Verificar `GET /health` incluye estado de la BD

### Checklist de seguridad (Fase 1)
- [ ] Columna `deleted_at` en `sales` y `expenses` — confirmado
- [ ] Tabla `audit_log` creada y de solo inserción (sin UPDATE/DELETE)
- [ ] Columna `token_hash` en `sessions` (no el token raw)
- [ ] WAL mode activado y verificado (`PRAGMA journal_mode` retorna `wal`)
- [ ] Toda columna de monto es `INTEGER NOT NULL` — ninguna `REAL` o `TEXT`
- [ ] Timestamps almacenados en UTC (regla de zona horaria · CLAUDE.md sección 7)

### Criterio de completitud
Migraciones corren desde cero sin errores. Tests de BD pasan. Schema completo verificado con Drizzle Studio.

**✅ COMPLETADA 2026-06-10** — Schema Drizzle, WAL mode, FK ON, busy_timeout=5000. Auto-migración en startup. Seed de dev. 8 tests pasan (consecutivos, soft-delete, WAL, FK). `/health` incluye `{ db: "ok" }`. Invocar `/grill-me` antes de Fase 2. *(Nota 2026-06-12: la tabla `print_jobs` se eliminó al migrar a impresión por navegador; se añadieron `apartados` + `apartado_payments` en la Fase 14.)*

---

## Fase 2 — Auth & Seguridad

**Objetivo:** login funcional, setup de primera ejecución, recuperación de cuenta, sesiones con expiración.

### Tareas Backend
- [ ] Middleware `auth.ts` — verifica sesión en cada request protegido (expiración 8h + inactividad 60min)
- [ ] Middleware `rate-limit.ts` — límites definidos en CLAUDE.md sección 6.4
- [ ] Middleware `security-headers.ts` — `Cache-Control: no-store` en todos los endpoints API
- [ ] `server/src/lib/crypto.ts` — funciones: `hashPassword`, `verifyPassword`, `generateRecoveryCode`, `hashToken`, `verifyToken` (todas argon2id)
- [ ] `server/src/lib/session.ts` — `createSession`, `verifySession`, `revokeSession`, `revokeAllSessions`
- [ ] `POST /auth/setup` — primera ejecución: crea admin, genera recovery code (mostrado una vez), guarda hashes
- [ ] `POST /auth/login` — verifica contraseña, crea sesión, retorna cookie HttpOnly+Secure+SameSite=Strict
- [ ] `POST /auth/logout` — revoca sesión activa
- [ ] `POST /auth/recover` — verifica recovery code, actualiza contraseña, genera nuevo recovery code, revoca TODAS las sesiones
- [ ] `GET /auth/me` — retorna estado de sesión (sin datos sensibles)
- [ ] `apps/server/scripts/reset-admin.ts` — script break-glass (CLAUDE.md sección 6.12): resetea contraseña del admin vía SSH/local, genera contraseña temporal + nuevo recovery code, invalida todas las sesiones

### Tareas Frontend
- [ ] Página de Setup (primera ejecución) — muestra recovery code con advertencia de guardar, toggle ver/ocultar
- [ ] Página de Login — email/contraseña, toggle ver/ocultar contraseña
- [ ] Página de Recuperación — ingreso de recovery code + nueva contraseña
- [ ] Guard de rutas — redirige a `/login` si no hay sesión válida
- [ ] Manejo de sesión expirada — redirige a `/login` con mensaje claro

### Checklist de seguridad (Fase 2)
- [ ] argon2id con parámetros `{ memoryCost: 65536, timeCost: 3, parallelism: 4 }`
- [ ] Recovery code mostrado UNA sola vez — sin forma de recuperarlo después
- [ ] Sesión expira a las 8h absolutas Y a los 60min de inactividad (`last_active_at` actualizado en cada request)
- [ ] Al cambiar contraseña: `revokeAllSessions()` ejecutado antes de crear la nueva sesión
- [ ] Rate limiting en `/auth/login` y `/auth/recover` — confirmado en middleware
- [ ] Errores de auth siempre genéricos al cliente ("Credenciales inválidas" — nunca "contraseña incorrecta" vs "usuario no existe")
- [ ] Cookie con `Secure` solo en `NODE_ENV=production`
- [ ] CORS configurado con `ALLOWED_ORIGIN` desde env — nunca hardcodeado

### Criterio de completitud
Login funciona, sesión expira, recovery flow completo. Tests de autorización: endpoints protegidos retornan 401 sin sesión y 403 con sesión inválida.

**✅ COMPLETADA 2026-06-10** — Backend: argon2id passwords + recovery codes, SHA-256 session tokens, cookie HttpOnly+Secure+SameSite=Strict, expiración 8h absoluta + 60min inactividad, rate limiting por ruta, CORS con ALLOWED_ORIGIN, Cache-Control: no-store global, break-glass script reset-admin.ts, cron daily cleanup de sesiones expiradas. `/grill-me` pasado: 4 gaps corregidos (COOKIE_NAME duplicado, SESSION_DURATION_MS duplicado, sessionId expuesto en /me, limpieza de sesiones). Frontend: TanStack Router con guard de rutas, páginas Login/Setup/Recover con AuthShell split-screen, dark mode flash-free, Inter Variable, OKLCH tokens Tailwind v4. tsc --noEmit limpio en ambos workspaces, 8 tests pasan.

---

## Fase 3 — Branding & Configuración Base

**Objetivo:** app muestra el branding de SIPNATO, dark mode funcional, módulo de Settings con datos del taller.

### Tareas Frontend
- [ ] Copiar assets de `BRAND/` a `apps/web/public/` (favicon.ico, favicon.svg, og-image.png)
- [ ] Configurar `index.html`: `<link rel="icon">` con SVG + ICO fallback, meta OG + `<meta name="viewport">`
- [ ] Componente `Logo.tsx` usando `favicon.svg`
- [ ] Implementar paleta azul ejecutivo en `tailwind.config.ts` (ver CLAUDE.md sección 5)
- [ ] Layout principal responsivo:
  - Desktop (`sm` y superior): Sidebar fijo izquierda con logo + navegación
  - Mobile (< `sm`): Bottom navigation bar o menú hamburguesa con drawer lateral
- [ ] Toggle dark mode persistente en `localStorage`, respeta `prefers-color-scheme` en primera visita
- [ ] Fuente Inter integrada
- [ ] Verificar navegación y consulta de boletas desde viewport 390px (iPhone)

### Tareas Backend
- [ ] `GET /api/settings` — retorna configuración del taller
- [ ] `PUT /api/settings` — actualiza configuración (protegido, registra en audit_log)
- [ ] Valores iniciales de settings: nombre taller, cédula, teléfono, leyendas por tipo de documento, hora cierre auto (default `00:00`), cierre auto activo (default `false`)

### Tareas de UI (invocar `/impeccable` + `/design-taste-frontend`)
- [ ] Página de Configuración: sección datos del taller, sección leyendas de tickets, sección cierre automático

### Checklist de seguridad (Fase 3)
- [ ] `PUT /api/settings` registra en `audit_log` con snapshot del cambio
- [ ] Content-Security-Policy en Caddyfile permite `font-src 'self'` para Inter si está bundleada

### Checklist mobile (Fase 3)
- [ ] `<meta name="viewport" content="width=device-width, initial-scale=1">` en `index.html`
- [ ] Layout no rompe en 390px — probado en DevTools mobile view
- [ ] Touch targets ≥ 44×44px en todos los controles de navegación

### Criterio de completitud
App carga con logo SIPNATO, favicon correcto, dark mode funciona, datos del taller se guardan y persisten. Navegación funciona desde celular.

**✅ COMPLETADA 2026-06-10** — Frontend: AppLayout con sidebar navy (desktop) + drawer + top bar (mobile), Logo.tsx con filtro brightness para fondo oscuro, useDarkMode hook con localStorage + prefers-color-scheme, DashboardPage grilla modular estilo Odoo (2/3/4 columnas responsive), SettingsPage con TanStack Query + form de 8 campos + toggle custom para cierre auto. Backend: GET/PUT /api/settings con requireAuth, audit_log en cada PUT, settingsSchema Zod compartido en packages/shared. Brand assets copiados (favicon.svg, favicon.ico, og-image.png), OG meta tags + theme-color en index.html. TanStack Router: catch-all $  route bajo _auth para módulos pendientes. tsc --noEmit limpio en web y server.

---

## Fase 4 — Control de Caja

**Objetivo:** apertura, cierre manual y automático, historial, regla de una sola caja abierta.

### Tareas Backend
- [ ] `POST /api/cash-registers/open` — abre caja con monto inicial, verifica que no haya una abierta
- [ ] `POST /api/cash-registers/close` — cierra caja activa, genera snapshot de totales
- [ ] `GET /api/cash-registers` — historial de cajas con paginación
- [ ] `GET /api/cash-registers/current` — caja activa actual (o null)
- [ ] `GET /api/cash-registers/:id` — detalle de una caja con ventas y gastos
- [ ] Job `auto-close.ts` — cron según hora configurada en settings, idempotente (no doble cierre), zona `America/Costa_Rica`
- [ ] Manejo de cierre retroactivo: si el servidor estuvo caído, cierra con la hora programada al arrancar

### Tareas Frontend (invocar `/impeccable` + `/design-taste-frontend`)
- [ ] Banner persistente "No hay caja abierta" en el layout cuando corresponde
- [ ] Modal de apertura de caja con monto inicial
- [ ] Pantalla de cierre manual con preview de totales
- [ ] Página de historial de cajas con detalle expandible

### Checklist de seguridad (Fase 4)
- [ ] `POST /api/cash-registers/open` es idempotente — no puede crear dos cajas abiertas (constraint en BD)
- [ ] Job de cierre automático registra en `audit_log`
- [ ] El snapshot del cierre es inmutable — se guarda en la fila, no se recalcula
- [ ] El cron usa la opción de timezone `America/Costa_Rica` explícitamente — no la TZ del contenedor (UTC)

### Criterio de completitud
Apertura, cierre manual y cierre automático funcionan. Test de idempotencia: dos llamadas a open con caja ya abierta retornan error claro.

**✅ COMPLETADA 2026-06-10** — Backend: POST /open, POST /close, GET /current, GET /, GET /:id + auto-close cron (cada minuto, zona CR UTC-6) + cierre retroactivo en startup. Frontend: CajaPage con modales de apertura/cierre, TotalsGrid, HistoryRow expandible, banner de advertencia en AppLayout. tsc --noEmit limpio en ambos workspaces.

---

## Fase 5 — Módulo POS (Ventas)

**Objetivo:** carga de ventas ágil desde teclado, 4 métodos de pago, calculadora de vuelto.

### Tareas Backend
- [ ] `POST /api/sales` — crea venta (descripción opcional, monto INTEGER, método pago, caja FK, consecutivo transaccional)
- [ ] `DELETE /api/sales/:id` — soft-delete (sets `deleted_at`), registra en `audit_log`
- [ ] `GET /api/sales` — ventas del día actual con filtros opcionales

### Tareas Frontend (invocar `/impeccable` + `/design-taste-frontend`)
- [ ] Formulario POS: descripción (opcional) → monto → método de pago → cobrar
- [ ] Orden de tabulación correcto (descripción → monto → método → botón cobrar)
- [ ] Enter en el último campo dispara la venta
- [ ] Drawer/modal calculadora de vuelto para pago en Efectivo: campo "recibido" → muestra vuelto en tamaño grande
- [ ] Feedback visual inmediato al cobrar (toast de confirmación)
- [ ] Bloqueo del formulario si no hay caja abierta (con opción de abrir)

### Checklist de seguridad (Fase 5)
- [ ] Monto validado en server: `INTEGER` ≥ 1, rechazar 0 y negativos
- [ ] Método de pago validado contra enum (`efectivo | tarjeta | transferencia | sinpe`)
- [ ] `POST /api/sales` verifica caja abierta en el servidor — no confiar en el frontend
- [ ] Soft-delete registrado en `audit_log` con el monto eliminado

### Criterio de completitud
Venta completa en menos de 5 teclas. Calculadora de vuelto funciona correctamente. Test: venta sin caja abierta retorna error claro.

**✅ COMPLETADA 2026-06-10** — Backend: POST /api/sales (consecutivo transaccional, caja verificada), DELETE /:id (soft-delete + audit_log), GET / (paginado, filtrado por caja activa). Frontend: POSPage con formulario (descripción→monto→método), ChangeCalcModal para efectivo con vuelto en tiempo real, toast de confirmación, lista de ventas con eliminación inline, bloqueo si no hay caja abierta. tsc --noEmit limpio en ambos workspaces. `/grill-me` ✅ 2026-06-11 — sin gaps.

---

## Fase 6 — Módulo de Gastos

**Objetivo:** registro de egresos del día, impacto en balance neto.

### Tareas Backend
- [ ] `POST /api/expenses` — crea gasto (descripción, monto INTEGER, caja FK)
- [ ] `DELETE /api/expenses/:id` — soft-delete, registra en `audit_log`
- [ ] `GET /api/expenses` — gastos de la caja activa

### Tareas Frontend (invocar `/impeccable` + `/design-taste-frontend`)
- [ ] Formulario de gasto: descripción + monto
- [ ] Lista de gastos del día con total
- [ ] Balance neto visible (Ingresos − Gastos)

### Checklist de seguridad (Fase 6)
- [ ] Monto validado: `INTEGER` ≥ 1
- [ ] Verifica caja abierta en el servidor antes de crear gasto

### Criterio de completitud
Gastos se registran y el balance neto se calcula correctamente.

**✅ COMPLETADA 2026-06-10** — Backend: POST /api/expenses (validado con Zod, caja verificada, audit_log), DELETE /:id (soft-delete + audit_log, verifica pertenencia a caja activa), GET / (lista gastos + total de la caja activa). Frontend: ExpensesPage con formulario descripción+monto, balance cards (Ingresos/Gastos/Balance neto) cuando hay caja abierta, lista con eliminación inline. Route `/gastos` registrada. tsc --noEmit limpio en ambos workspaces. `/grill-me` ✅ 2026-06-11 — sin gaps.

---

## Fase 7 — Base de Datos de Clientes & Boletas

**Objetivo:** módulo de clientes consultable + boletas como recibos de ingreso de equipo.

### Tareas Backend
- [ ] `GET /api/customers` — lista con búsqueda por nombre, celular, cédula (paginada)
- [ ] `GET /api/customers/:id` — detalle + historial de boletas
- [ ] `POST /api/boletas` — crea boleta con cliente (crea cliente si no existe) + datos del equipo, consecutivo transaccional
- [ ] `GET /api/boletas` — historial buscable (por cliente, celular, IMEI, número)
- [ ] `GET /api/boletas/:id` — detalle de boleta

### Tareas Frontend (invocar `/impeccable` + `/design-taste-frontend`)
- [ ] Módulo Clientes: tabla con búsqueda, ver historial de boletas por cliente
- [ ] Formulario de boleta: autocompletado de cliente por celular, campos del equipo
- [ ] Historial de boletas con búsqueda y filtros

### Checklist de seguridad (Fase 7)
- [ ] Celular validado: exactamente 8 dígitos numéricos
- [ ] IMEI validado: 15 dígitos + algoritmo de Luhn
- [ ] Cédula: solo alfanumérica, longitud razonable (máx 20 chars)
- [ ] Contraseña de desbloqueo del equipo: almacenada como texto plano con advertencia en UI (es dato del cliente, no secreto del sistema) — documentado

### Criterio de completitud
Boleta creada, cliente guardado, autocompletado funciona en segunda visita del mismo cliente.

**✅ COMPLETADA 2026-06-10** — Shared: `schemas/customer.ts` + `schemas/boleta.ts` (validateImei con Luhn, createBoletaSchema con validación IMEI 15 dígitos, phone 8 dígitos CR, idNumber alfanumérico). Backend: `modules/customers/` (búsqueda LIKE por nombre/phone/idNumber, paginada; GET /:id con historial de boletas) + `modules/boletas/` (find-or-create customer por phone en transacción, consecutivo del counter `boleta`, JOIN customers en listado/detalle, búsqueda multi-campo). Frontend: BoletasPage (búsqueda + lista expandible), NuevoBoletaPage (autocomplete de cliente por celular, advertencia contraseña plain text, validación IMEI en tiempo real), CustomersPage (búsqueda + historial lazy). 3 rutas: /boletas, /nueva-boleta, /clientes. tsc --noEmit limpio en ambos workspaces. `/grill-me` ? 2026-06-11 � sin gaps.

---

## Fase 8 — Cotizaciones

**Objetivo:** presupuestos con líneas de ítems, numeración consecutiva, imprimibles.

### Tareas Backend
- [x] `POST /api/quotes` — crea cotización con sus ítems (transacción: quote + items + consecutivo)
- [x] `GET /api/quotes` — historial paginado
- [x] `GET /api/quotes/:id` — detalle con ítems
- [x] `DELETE /api/quotes/:id` — eliminar cotización (hard delete permitido — no es registro financiero)

### Tareas Frontend (invocar `/impeccable` + `/design-taste-frontend`)
- [x] Formulario de cotización: agregar/quitar ítems dinámicamente, total en tiempo real
- [x] Historial de cotizaciones
- [ ] Vista de detalle imprimible (diferida a Fase 12 — Print Bridge)

### Checklist de seguridad (Fase 8)
- [x] Total de cotización calculado en el servidor — no confiar en el total enviado por el cliente
- [x] Todos los montos de ítems validados como `INTEGER` ≥ 0

### Criterio de completitud
Cotización con múltiples ítems se crea y el total coincide exactamente con la suma de ítems calculada en el servidor.

**✅ COMPLETADA 2026-06-10** — Backend: POST/GET/GET:id/DELETE con transacción atómica (counter+quote+items+audit_log). Total calculado en servidor, nunca del cliente. Hard delete en transaction (items → quote → audit). Frontend: NuevaCotizacionPage (ítems dinámicos, total en tiempo real), QuotesPage (historial expandible, detalle bajo demanda, paginación, inline delete). tsc --noEmit limpio en ambos workspaces. `/grill-me` ✅ 2026-06-11 — sin gaps.

---

## Fase 9 — Notas Internas

**Objetivo:** bloc de notas CRUD simple para recordatorios internos.

### Tareas Backend
- [x] `POST /api/notes` — crear nota (título + texto)
- [x] `PUT /api/notes/:id` — editar nota
- [x] `DELETE /api/notes/:id` — eliminar nota (hard delete — no es dato financiero)
- [x] `GET /api/notes` — listar notas ordenadas por `updated_at` desc

### Tareas Frontend
- [x] Lista de notas tipo tarjetas (grid 1/2/3 cols responsive)
- [x] Editor inline (título + textarea, per-card edit mode)

### Checklist de seguridad (Fase 9)
- [x] Texto de nota: máximo 5000 caracteres (validado en servidor)
- [x] Título: máximo 200 caracteres

### Criterio de completitud
CRUD completo de notas funciona con actualización en tiempo real en la UI.

**✅ COMPLETADA 2026-06-10** — Backend: GET/POST/PUT/DELETE con audit_log en create (bodyLength) y delete (full snapshot). updateNoteRow setea updatedAt manualmente. Service sin dependencia de caja. Frontend: NotesPage con DraftCard (nueva nota), NoteCard (editor inline por tarjeta, confirmación de borrado), grid 1/2/3 cols responsive. Route `/notas` registrada. tsc limpio. `/grill-me` ? 2026-06-11 � sin gaps.

---

## Fase 10 — Reporte de Ventas ✅ COMPLETADA 2026-06-11

**Objetivo:** visualización y análisis de ventas por período, método de pago y balance.

### Tareas Backend
- [x] `GET /api/reports/sales` — ventas con filtros: rango de fechas, método de pago, búsqueda por descripción
- [x] `GET /api/reports/summary` — totales por período: ingresos por método, gastos, balance neto, número de ventas
- [x] `GET /api/reports/daily` — resumen por día (para gráfica de barras)

### Tareas Frontend (invocar `/impeccable` + `/design-taste-frontend`)
- [x] Filtros de fecha (hoy / esta semana / este mes / rango personalizado)
- [x] Tabla de ventas con paginación y exportación simple
- [x] Tarjetas de totales: ingresos por método, gastos, balance neto
- [x] Gráfica de barras de ventas diarias (Recharts BarChart)

### Checklist de seguridad (Fase 10)
- [x] Parámetros de filtro de fecha validados con zod (fechas válidas, rango máximo razonable ej. 1 año)
- [x] Queries con soft-delete filtrado (`WHERE deleted_at IS NULL`)
- [x] Paginación obligatoria — nunca retornar todos los registros sin límite
- [x] Límites de fecha (hoy/semana/mes) computados en `America/Costa_Rica`, no en UTC (CLAUDE.md sección 7)

### Criterio de completitud
Reporte muestra datos correctos para el período seleccionado, coincide con los cierres de caja del mismo período.

**Notas:** `/grill-me` completado 2026-06-11 — 4 correcciones aplicadas (validación calendaria de fechas, `GROUP BY` SQL en summary, `reportExportFilterSchema`, query daily refactorizado). Corrección adicional: `@fastify/cookie`, `@fastify/cors`, `@fastify/rate-limit` actualizados de v9 a v10+ (compatibilidad con Fastify v5).

---

## Fase 11 — Dashboard ✅ COMPLETADA 2026-06-11

**Objetivo:** resumen del día en una sola pantalla.

### Tareas Backend
- [x] `GET /api/dashboard` — datos del día: ingresos por método, gastos, balance neto, estado caja, cantidad de boletas (estado puente de impresión diferido a Fase 12)

### Tareas Frontend (invocar `/impeccable` + `/design-taste-frontend`)
- [x] Franja de estado del día (ventas por método de pago, gastos, balance neto)
- [x] Estado de caja (abierta/cerrada, hora apertura, monto inicial)
- [x] Link rápido "Abrir caja →" cuando caja está cerrada
- [x] Contadores: ventas y boletas del día

### Criterio de completitud
Dashboard carga en < 300ms, datos correctos. Primera pantalla que ve el admin al iniciar sesión.

**Notas:** Estado del puente de impresión diferido a Fase 12 (requiere WebSocket activo). Accesos directos delegados a la grilla de módulos existente (ya cumple esa función). `/grill-me` completado 2026-06-11 — `crDayRangeToUtc` extraído a `lib/cr-time.ts`.

---

## Fase 12 — Impresión de Tickets (vía navegador) ✅ COMPLETADA 2026-06-12

**Objetivo:** imprimir tickets de 80mm y cotizaciones directamente desde el navegador, sin servicio local ni hardware especial.

> **Decisión de diseño (2026-06-12):** se construyó primero un print-bridge WebSocket (servidor `/ws/print` + app `apps/print-bridge` con ESC/POS + token argon2id), pero el setup era demasiado frágil para un solo usuario (instalar servicio de Windows, generar/rotar token, mantener el WS vivo). Se reemplazó por **impresión nativa del navegador** (`window.print()` con `@page { size: 80mm auto }` y overlays vía React Portal). El print-bridge completo fue eliminado del código el 2026-06-12 (ver CLAUDE.md, historial).

### Implementación
- [x] Impresión de tickets de venta 80mm desde POS (`SalePrintView` + portal, body class `print-sale`)
- [x] Impresión de cotizaciones (layout A4, `QuotePrintView` + portal)
- [x] Botón de impresora por venta en POS
- [x] Sección "Impresora de tickets" en Configuración con botón de ticket de prueba
- [x] Instrucciones de impresora predeterminada Epson en `deploy/DEPLOY.md`

### Eliminado al migrar
- [x] `apps/print-bridge/` (app completa)
- [x] `apps/server/src/modules/print/` (WebSocket + `print_jobs`)
- [x] `packages/shared/src/schemas/print.ts`, `apps/web/src/features/print/`
- [x] Token del bridge en Settings + plugin `@fastify/websocket` + tabla `print_jobs` (migración 0004)

### Criterio de completitud
Imprimir una venta o cotización abre el diálogo del navegador y sale el ticket en la Epson predeterminada. No requiere instalar nada en la PC del taller.

---

## Fase 13 — Despliegue (VPS + Docker + Caddy)

**Objetivo:** SIPNATO corriendo en producción con HTTPS, backup automático y acceso por subdominio.

### Tareas
- [ ] Crear `deploy/docker-compose.yml` (services: `server`, `caddy`; volúmenes: `sipnato-data`, `caddy-data`)
- [ ] Crear `deploy/Caddyfile` con:
  - HTTPS automático (Let's Encrypt)
  - Reverse proxy a Fastify
  - Todos los security headers de CLAUDE.md sección 6.6
- [ ] Crear `deploy/backup.sh` — copia usando `better-sqlite3` backup API, rotación 30 días
- [ ] Configurar cron del sistema para `backup.sh` (diario a las 3:00 AM)
- [ ] Configurar UFW en VPS: solo puertos 80, 443 y SSH (22 o custom)
- [ ] Configurar acceso SSH por clave únicamente (deshabilitar autenticación por contraseña)
- [ ] Variable `ALLOWED_ORIGIN` apuntando al subdominio real
- [ ] Verificar `GET /health` desde internet
- [ ] Test de descarga de backup desde el panel
- [ ] Configurar la Epson TM-T20II como impresora predeterminada en la PC del taller

### Checklist de seguridad (Fase 13)
- [ ] `NODE_ENV=production` en el contenedor del servidor
- [ ] Todos los headers de seguridad activos y verificados (usar securityheaders.com)
- [ ] HTTPS forzado (Caddy redirige HTTP → HTTPS automáticamente)
- [ ] Backup del día 1 probado y restaurado exitosamente (probar restore, no solo backup)
- [ ] SSH por clave confirmado — contraseña deshabilitada en `/etc/ssh/sshd_config`
- [ ] Firewall UFW activo y verificado

### Criterio de completitud
SIPNATO accesible desde internet por subdominio HTTPS. Login funciona. Una venta completa genera ticket impreso. Backup descargable desde Configuración.

**Al completar:** actualizar `CLAUDE.md` con fecha de go-live · marcar `[x]` aquí · **¡SIPNATO está en producción!**

---

## Fase 14 — Módulo de Apartados (Layaway) ✅ COMPLETADA 2026-06-12

**Objetivo:** registrar reservas de productos con abonos parciales hasta completar el pago.

### Tareas Backend
- [x] Tablas `apartados` + `apartado_payments` (migración 0003), contador `apartado`
- [x] `GET /api/apartados` — listado con filtro por estado y búsqueda (nombre/teléfono/descripción)
- [x] `GET /api/apartados/:id` — detalle con historial de abonos
- [x] `POST /api/apartados` — crea apartado con depósito inicial opcional (transacción + audit_log)
- [x] `POST /api/apartados/:id/payments` — registra abono, auto-completa al alcanzar el total
- [x] `POST /api/apartados/:id/cancel` — cancela apartado activo

### Tareas Frontend
- [x] `ApartadosPage` — tabs por estado (Activos/Completados/Cancelados), búsqueda, barra de progreso de pago
- [x] Modal de creación, formulario de abono inline, cancelación con confirmación
- [x] Ítem de navegación en el sidebar (ícono `Package`)

### Checklist de seguridad (Fase 14)
- [x] Montos validados `INTEGER` ≥ 1 en servidor; teléfono 8 dígitos CR
- [x] Estado y total recalculados en el servidor — nunca del cliente
- [x] Soft-delete (`deleted_at`) en `apartados`; audit_log en crear/abonar/cancelar

### Criterio de completitud
Crear un apartado con depósito, registrar abonos sucesivos y ver el estado pasar a "completado" automáticamente al cubrir el total.

---

## Polish post-lanzamiento — 2026-06-13

Mejoras de UI/branding aplicadas tras el go-live inicial, sin tocar lógica de negocio.

- **Logo transparente:** `logo.png` generado desde el JPG original usando conversión luminancia→alpha (PowerShell + System.Drawing). Eliminado `mix-blend-screen`. Favicon simplificado a un único `<link type="image/png">`. `apple-touch-icon` añadido para previews iOS correctos.
- **Banner eliminado:** "No hay caja abierta" quitado del `AppLayout` permanentemente. El estado de caja es visible en el Dashboard; el banner interrumpía el flujo.
- **Animación en botón "Ingresar":** letter-swap al hover — las 8 letras de "Ingresar" salen hacia abajo y una copia entra desde arriba, con delay escalonado por caracter (0.20s → 0.76s). Sin animación en estado `disabled`.
- **Personaje animado en panel de login (desktop):** blob mesh-gradient azul con forma orgánica, dos ojos que siguen el cursor del mouse con spring physics, parpadeo periódico cada ~3 segundos, y flotación vertical suave en loop. Usa `@paper-design/shaders-react` + `framer-motion`. Fix de incompatibilidad React 19 / framer-motion con `resolve.dedupe` + `optimizeDeps.include` en `vite.config.ts`.

---

## Notas

- **Cada fase de backend termina con `/grill-me`** antes de avanzar — sin excepciones.
- **Cada fase de frontend usa `/impeccable` + `/design-taste-frontend`** para la UI.
- **Íconos siempre con `/ui-ux-pro-max`** — Lucide React como biblioteca base.
- El ROADMAP es la fuente de verdad del avance — si no está marcado aquí, no está hecho.
