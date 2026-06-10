# ROADMAP — SIPNATO POS

> Desarrollo por fases pequeñas y lógicas. Cada fase es atómica: una sola responsabilidad, verificable antes de avanzar.
> Al completar cada fase: marcar `[x]`, anotar la fecha y actualizar `CLAUDE.md`.
> Última actualización: 2026-06-09

---

## Estado general

| Fase | Nombre | Estado |
|---|---|---|
| 0 | Monorepo & Tooling | ⬜ Pendiente |
| 1 | Schema de BD & Migraciones | ⬜ Pendiente |
| 2 | Auth & Seguridad | ⬜ Pendiente |
| 3 | Branding & Configuración Base | ⬜ Pendiente |
| 4 | Control de Caja | ⬜ Pendiente |
| 5 | Módulo POS (Ventas) | ⬜ Pendiente |
| 6 | Módulo de Gastos | ⬜ Pendiente |
| 7 | Base de Datos de Clientes & Boletas | ⬜ Pendiente |
| 8 | Cotizaciones | ⬜ Pendiente |
| 9 | Notas Internas | ⬜ Pendiente |
| 10 | Reporte de Ventas | ⬜ Pendiente |
| 11 | Dashboard | ⬜ Pendiente |
| 12 | Puente de Impresión (Print Bridge) | ⬜ Pendiente |
| 13 | Despliegue (VPS + Docker + Caddy) | ⬜ Pendiente |

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

**Al completar:** invocar `/grill-me` · actualizar `CLAUDE.md` sección 11 · marcar `[x]` aquí.

---

## Fase 1 — Schema de BD & Migraciones

**Objetivo:** todas las tablas definidas en Drizzle, migradas y probadas con seed de datos.

### Tareas
- [ ] Configurar `better-sqlite3` con WAL mode (`PRAGMA journal_mode=WAL`)
- [ ] Definir schema Drizzle completo (14 tablas):
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
  - `print_jobs` — tipo, payload JSON, estado (pending/printed/failed), intentos, created_at
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

### Criterio de completitud
Migraciones corren desde cero sin errores. Tests de BD pasan. Schema completo verificado con Drizzle Studio.

**Al completar:** invocar `/grill-me` · actualizar `CLAUDE.md` · marcar `[x]` aquí.

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

**Al completar:** invocar `/grill-me` · actualizar `CLAUDE.md` · marcar `[x]` aquí.

---

## Fase 3 — Branding & Configuración Base

**Objetivo:** app muestra el branding de SIPNATO, dark mode funcional, módulo de Settings con datos del taller.

### Tareas Frontend
- [ ] Copiar assets de `BRAND/` a `apps/web/public/` (favicon.ico, favicon.svg, og-image.png)
- [ ] Configurar `index.html`: `<link rel="icon">` con SVG + ICO fallback, meta OG
- [ ] Componente `Logo.tsx` usando `favicon.svg`
- [ ] Implementar paleta azul ejecutivo en `tailwind.config.ts` (ver CLAUDE.md sección 5)
- [ ] Layout principal: Sidebar con logo + navegación + toggle dark mode
- [ ] Toggle dark mode persistente en `localStorage`, respeta `prefers-color-scheme` en primera visita
- [ ] Fuente Inter integrada

### Tareas Backend
- [ ] `GET /api/settings` — retorna configuración del taller
- [ ] `PUT /api/settings` — actualiza configuración (protegido, registra en audit_log)
- [ ] Valores iniciales de settings: nombre taller, cédula, teléfono, leyendas por tipo de documento, hora cierre auto (default `00:00`), cierre auto activo (default `false`)

### Tareas de UI (invocar `/impeccable` + `/design-taste-frontend`)
- [ ] Página de Configuración: sección datos del taller, sección leyendas de tickets, sección cierre automático

### Checklist de seguridad (Fase 3)
- [ ] `PUT /api/settings` registra en `audit_log` con snapshot del cambio
- [ ] Content-Security-Policy en Caddyfile permite `font-src 'self'` para Inter si está bundleada

### Criterio de completitud
App carga con logo SIPNATO, favicon correcto, dark mode funciona, datos del taller se guardan y persisten.

**Al completar:** invocar `/grill-me` · actualizar `CLAUDE.md` · marcar `[x]` aquí.

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

### Criterio de completitud
Apertura, cierre manual y cierre automático funcionan. Test de idempotencia: dos llamadas a open con caja ya abierta retornan error claro.

**Al completar:** invocar `/grill-me` · actualizar `CLAUDE.md` · marcar `[x]` aquí.

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

**Al completar:** invocar `/grill-me` · actualizar `CLAUDE.md` · marcar `[x]` aquí.

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

**Al completar:** invocar `/grill-me` · actualizar `CLAUDE.md` · marcar `[x]` aquí.

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

**Al completar:** invocar `/grill-me` · actualizar `CLAUDE.md` · marcar `[x]` aquí.

---

## Fase 8 — Cotizaciones

**Objetivo:** presupuestos con líneas de ítems, numeración consecutiva, imprimibles.

### Tareas Backend
- [ ] `POST /api/quotes` — crea cotización con sus ítems (transacción: quote + items + consecutivo)
- [ ] `GET /api/quotes` — historial paginado
- [ ] `GET /api/quotes/:id` — detalle con ítems
- [ ] `DELETE /api/quotes/:id` — eliminar cotización (hard delete permitido — no es registro financiero)

### Tareas Frontend (invocar `/impeccable` + `/design-taste-frontend`)
- [ ] Formulario de cotización: agregar/quitar ítems dinámicamente, total en tiempo real
- [ ] Historial de cotizaciones
- [ ] Vista de detalle imprimible

### Checklist de seguridad (Fase 8)
- [ ] Total de cotización calculado en el servidor — no confiar en el total enviado por el cliente
- [ ] Todos los montos de ítems validados como `INTEGER` ≥ 0

### Criterio de completitud
Cotización con múltiples ítems se crea y el total coincide exactamente con la suma de ítems calculada en el servidor.

**Al completar:** invocar `/grill-me` · actualizar `CLAUDE.md` · marcar `[x]` aquí.

---

## Fase 9 — Notas Internas

**Objetivo:** bloc de notas CRUD simple para recordatorios internos.

### Tareas Backend
- [ ] `POST /api/notes` — crear nota (título + texto)
- [ ] `PUT /api/notes/:id` — editar nota
- [ ] `DELETE /api/notes/:id` — eliminar nota (hard delete — no es dato financiero)
- [ ] `GET /api/notes` — listar notas ordenadas por `updated_at` desc

### Tareas Frontend (invocar `/impeccable` + `/design-taste-frontend`)
- [ ] Lista de notas tipo tarjetas
- [ ] Editor inline (título + textarea)

### Checklist de seguridad (Fase 9)
- [ ] Texto de nota: máximo 5000 caracteres (validado en servidor)
- [ ] Título: máximo 200 caracteres

### Criterio de completitud
CRUD completo de notas funciona con actualización en tiempo real en la UI.

**Al completar:** invocar `/grill-me` · actualizar `CLAUDE.md` · marcar `[x]` aquí.

---

## Fase 10 — Reporte de Ventas

**Objetivo:** visualización y análisis de ventas por período, método de pago y balance.

### Tareas Backend
- [ ] `GET /api/reports/sales` — ventas con filtros: rango de fechas, método de pago, búsqueda por descripción
- [ ] `GET /api/reports/summary` — totales por período: ingresos por método, gastos, balance neto, número de ventas
- [ ] `GET /api/reports/daily` — resumen por día (para gráfica de barras)

### Tareas Frontend (invocar `/impeccable` + `/design-taste-frontend`)
- [ ] Filtros de fecha (hoy / esta semana / este mes / rango personalizado)
- [ ] Tabla de ventas con paginación y exportación simple
- [ ] Tarjetas de totales: ingresos por método, gastos, balance neto
- [ ] Gráfica de barras de ventas diarias (librería: Recharts, ligera y compatible con Tailwind)

### Checklist de seguridad (Fase 10)
- [ ] Parámetros de filtro de fecha validados con zod (fechas válidas, rango máximo razonable ej. 1 año)
- [ ] Queries con soft-delete filtrado (`WHERE deleted_at IS NULL`)
- [ ] Paginación obligatoria — nunca retornar todos los registros sin límite

### Criterio de completitud
Reporte muestra datos correctos para el período seleccionado, coincide con los cierres de caja del mismo período.

**Al completar:** invocar `/grill-me` · actualizar `CLAUDE.md` · marcar `[x]` aquí.

---

## Fase 11 — Dashboard

**Objetivo:** resumen del día en una sola pantalla.

### Tareas Backend
- [ ] `GET /api/dashboard` — datos del día: ingresos por método, gastos, balance neto, estado caja, cantidad de boletas, estado del puente de impresión

### Tareas Frontend (invocar `/impeccable` + `/design-taste-frontend`)
- [ ] Tarjetas de KPIs del día
- [ ] Estado de caja (abierta/cerrada, hora apertura, monto inicial)
- [ ] Estado del puente de impresión (conectado/desconectado, última actividad)
- [ ] Accesos directos a acciones frecuentes (abrir caja, nueva venta, nueva boleta)

### Criterio de completitud
Dashboard carga en < 300ms, datos correctos. Primera pantalla que ve el admin al iniciar sesión.

**Al completar:** invocar `/grill-me` · actualizar `CLAUDE.md` · marcar `[x]` aquí.

---

## Fase 12 — Puente de Impresión (Print Bridge)

**Objetivo:** impresión silenciosa con un clic desde cualquier módulo con ticketera USB local.

### Tareas Backend
- [ ] Endpoint WebSocket `/ws/print` — acepta conexión del bridge con token (header `Authorization: Bearer`)
- [ ] `POST /api/print/jobs` — crea trabajo de impresión (guardado en `print_jobs`)
- [ ] `PATCH /api/print/jobs/:id/ack` — bridge confirma impresión exitosa
- [ ] `PATCH /api/print/jobs/:id/fail` — bridge reporta fallo
- [ ] `GET /api/print/jobs/pending` — trabajos pendientes (para reenvío al reconectar)
- [ ] Configuración de impresora y token del bridge en Settings (genera token con `crypto.randomBytes(32).toString('hex')`)
- [ ] Endpoint `POST /api/print/test` — envía trabajo de prueba

### Tareas Frontend
- [ ] Indicador de estado del bridge en el layout (conectado / desconectado)
- [ ] Botón "Reimprimir" en ventas, boletas y cotizaciones
- [ ] Página de configuración de impresora + botón de prueba
- [ ] Generación de token del bridge (mostrado UNA vez, con advertencia)

### Tareas Print Bridge (`apps/print-bridge`)
- [ ] Cliente WebSocket con reconexión exponential backoff
- [ ] Conversión de payload → bytes ESC/POS para tickets de 80mm
- [ ] Instalación como servicio de Windows (instrucciones en README del bridge)

### Checklist de seguridad (Fase 12)
- [ ] Token del bridge validado en el handshake WS — conexiones sin token son rechazadas con código 401
- [ ] Token almacenado hasheado en BD — solo el hash, nunca el token plano
- [ ] El bridge NO tiene acceso a ningún endpoint de datos de negocio
- [ ] Rate limit de reconexiones: máximo 3 fallos por minuto antes de blacklist temporal

### Criterio de completitud
Imprimir una venta desde la UI genera ticket en la ticketera física sin diálogos intermedios. Reimprimir funciona. Desconectar el bridge y reconectar despacha los trabajos pendientes.

**Al completar:** invocar `/grill-me` · actualizar `CLAUDE.md` · marcar `[x]` aquí.

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
- [ ] Instalar print-bridge en PC del taller como servicio de Windows

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

## Notas

- **Cada fase de backend termina con `/grill-me`** antes de avanzar — sin excepciones.
- **Cada fase de frontend usa `/impeccable` + `/design-taste-frontend`** para la UI.
- **Íconos siempre con `/ui-ux-pro-max`** — Lucide React como biblioteca base.
- El ROADMAP es la fuente de verdad del avance — si no está marcado aquí, no está hecho.
