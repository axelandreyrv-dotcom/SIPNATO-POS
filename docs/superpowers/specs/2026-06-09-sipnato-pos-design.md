# SIPNATO POS — Spec de diseño

**Fecha:** 2026-06-09
**Estado:** Aprobado por el usuario (entrevista de diseño completada)
**Contexto:** Sistema POS para un taller de reparación de celulares y venta de accesorios en Costa Rica. Un solo local, una sola persona operando el sistema.

---

## 1. Decisiones de arquitectura (cerradas en entrevista)

| Tema | Decisión |
|---|---|
| Hosting | VPS en la nube (~$5–8/mes), acceso vía dominio/subdominio con HTTPS automático (Caddy + Let's Encrypt) |
| Stack | TypeScript end-to-end: React + Vite + Tailwind CSS (frontend), Fastify + better-sqlite3 + Drizzle ORM (backend) |
| Base de datos | SQLite como archivo único local en el VPS |
| Impresión | Puente de impresión propio (`print-bridge`): servicio Node en la PC del taller, conectado al servidor por WebSocket, imprime vía ESC/POS a ticketera de 80mm |
| Usuarios | Un solo administrador. El registro es un setup de primera ejecución |
| Moneda | Solo colones (₡). Montos como **enteros** (sin decimales). El monto digitado es el total final, sin desglose de IVA |
| Alcance fiscal | Boletas y recibos son documentos internos del taller. **Facturación electrónica de Hacienda: fuera de alcance** |
| Boletas | Documento-recibo de ingreso de equipo. **Sin estados de workflow, sin abonos** |
| Inventario | **Sin catálogo de productos ni control de stock.** Venta por carga manual pura |
| Respaldo | Backup automático diario del archivo SQLite con rotación de 30 días + descarga manual desde Configuración |
| Forma del proyecto | Monorepo pnpm con 3 apps (`web`, `server`, `print-bridge`) + 1 paquete compartido (`shared`) |

## 2. Arquitectura general

```
   [Navegador: SPA React]
            │ HTTPS
            ▼
   [VPS] Caddy (HTTPS automático)
            │
            ▼
        API Fastify ──── node-cron (cierre automático de caja, backup diario)
            │
            ▼
        SQLite (archivo único + /backups, rotación 30 días)
            ▲
            │ WebSocket (token propio del puente)
   [PC del taller] print-bridge ──ESC/POS──► Ticketera 80mm
```

### Flujo de impresión (cola de trabajos)

1. Una acción imprimible (venta, boleta, cotización, cierre, prueba) crea un registro en `print_jobs` con el payload estructurado del ticket.
2. Si el puente está conectado por WebSocket, recibe el trabajo al instante, lo convierte a bytes ESC/POS, imprime y confirma (ACK → estado `printed`).
3. Si el puente está desconectado, el trabajo queda `pending` y se despacha al reconectar.
4. La UI muestra el estado del puente (conectado/desconectado) en todo momento. Todo documento tiene botón **Reimprimir** (crea un nuevo job con el mismo payload).
5. La impresión **nunca bloquea** la operación de negocio: la venta/boleta se guarda aunque la impresión falle.

El render del ticket (payload → ESC/POS y payload → preview HTML) vive en `packages/shared/tickets` para que el servidor, el puente y el frontend usen exactamente la misma representación.

## 3. Módulos funcionales

### 3.1 POS ágil (ventas)
- Formulario único: descripción (opcional), monto en ₡, método de pago.
- Métodos: **Efectivo, Tarjeta, Transferencia, SINPE Móvil**.
- Efectivo abre la **calculadora de vuelto**: se digita con cuánto paga el cliente y se muestra el vuelto en tamaño grande.
- Al cobrar: registra la venta asociada a la caja abierta, imprime recibo con numeración consecutiva.
- Requiere caja abierta; si no hay, ofrece abrirla en el momento.

### 3.2 Control de caja
- **Apertura manual** con monto inicial de efectivo.
- **Cierre manual** en cualquier momento, o **cierre automático** a la hora configurada (default 12:00 AM, zona horaria `America/Costa_Rica`) ejecutado por node-cron en el servidor.
- El cierre genera un corte: totales por método de pago, total de gastos, balance neto (ingresos − gastos), monto inicial y efectivo esperado. El corte es imprimible.
- **Historial de cajas** consultable con su detalle.
- Solo puede existir una caja abierta a la vez.

### 3.3 Gastos diarios
- Registro de egresos: descripción + monto, asociados a la caja/día.
- Restan en el balance neto del día (visible en dashboard y en el cierre).

### 3.4 Boletas (ingreso de equipos)
- Cliente: **nombre y celular obligatorios**; correo, dirección y cédula opcionales.
- Equipo: modelo, IMEI/serie, contraseña de desbloqueo (si aplica), descripción del trabajo/falla.
- Los clientes se guardan en tabla propia y se **autocompletan por número de celular** en visitas futuras.
- Imprime boleta con numeración consecutiva propia. Historial buscable (por cliente, celular, IMEI, número).
- Sin estados ni abonos: es el respaldo documental de que el equipo quedó en el taller.

### 3.5 Cotizaciones
- Líneas de descripción + monto, total automático.
- Numeración consecutiva propia. Imprimible. Historial consultable.

### 3.6 Notas internas
- Bloc simple: título + texto + fecha. Crear, editar, eliminar.

### 3.7 Configuración
- Datos del taller: nombre, cédula, teléfono (aparecen en el encabezado de todos los tickets).
- Leyendas legales / garantías para el pie de los tickets (texto por tipo de documento).
- Hora del cierre automático de caja (activable/desactivable).
- Impresora: estado del puente, botón de **impresión de prueba**.
- Respaldo: descarga del archivo SQLite bajo demanda.

### 3.8 Dashboard
- Vista del día: ingresos por método de pago, gastos, balance neto, estado de la caja, estado del puente de impresión.

## 4. Modelo de datos (SQLite, 13 tablas)

| Tabla | Propósito |
|---|---|
| `admin` | 1 fila: hash argon2 de contraseña + hash argon2 del código de recuperación |
| `sessions` | Sesiones activas (token, expiración) |
| `settings` | Clave-valor: datos del taller, leyendas, hora de cierre automático, etc. |
| `cash_registers` | Cajas: apertura (fecha, monto inicial), cierre (fecha, tipo manual/automático, totales snapshot) |
| `sales` | Ventas: descripción opcional, monto, método de pago, caja, consecutivo, timestamp |
| `expenses` | Gastos: descripción, monto, caja, timestamp |
| `customers` | Clientes: nombre, celular (índice de búsqueda), correo/dirección/cédula opcionales |
| `boletas` | Boletas: cliente (FK), modelo, IMEI/serie, contraseña de desbloqueo, descripción, consecutivo, timestamp |
| `quotes` | Cotizaciones: consecutivo, total, timestamp |
| `quote_items` | Líneas de cotización: descripción, monto |
| `notes` | Notas: título, texto, timestamps |
| `print_jobs` | Cola de impresión: tipo, payload JSON, estado (`pending`/`printed`/`failed`), intentos |
| `counters` | Consecutivos por tipo de documento (venta, boleta, cotización); incremento dentro de la misma transacción que crea el documento — sin huecos ni repetidos |

**Regla de dinero:** todos los montos son `INTEGER` en colones. El formateo (`₡12 500`) vive en `packages/shared/money.ts` y es el único punto de formato.

## 5. Seguridad

- **Setup inicial** (primera ejecución): se crea la contraseña del admin y el sistema genera un **código de recuperación** alfanumérico (`SIPNATO-XXXX-XXXX-XXXX`), mostrado **una sola vez** con advertencia de guardarlo. Solo se persiste su hash.
- **Login:** contraseña con argon2, sesión por cookie `HttpOnly` + `Secure` + `SameSite`, rate-limiting de intentos.
- **Recuperación:** ingresar el código de recuperación permite definir contraseña nueva y genera un código de recuperación nuevo (el anterior queda inválido).
- **Toggle de contraseña:** botón 👁 para ver/ocultar en todos los campos de contraseña.
- **Puente de impresión:** se autentica con un token propio (generado en Configuración); solo puede recibir trabajos de impresión y confirmar, sin acceso a datos de negocio.
- Toda la API detrás de sesión salvo `/auth/*` y el WebSocket del puente.

## 6. UI

- **Identidad:** azul ejecutivo + blanco, usando los logos existentes en `BRAND/`.
- **Modo oscuro nativo:** estrategia `class` de Tailwind, toggle persistente, respeta preferencia del sistema por defecto.
- **Layout:** sidebar de navegación por módulos + área de contenido. POS optimizado para teclado (orden de tabulación, Enter para cobrar).
- Minimalista: sin librerías de componentes pesadas; componentes propios en `apps/web/src/components/`.

## 7. Estructura de carpetas (monorepo pnpm)

```
SIPNATO POS/
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── .env.example
├── .gitignore
├── README.md
├── BRAND/                            # logos existentes (svg, png, ico)
├── docs/
│   └── superpowers/specs/            # este documento
│
├── apps/
│   ├── web/                          # SPA — React + Vite + Tailwind
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts        # paleta azul ejecutivo + darkMode: 'class'
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── app/                  # router.tsx, providers.tsx, layout/ (sidebar, topbar, toggle dark)
│   │       ├── features/             # 1 carpeta por módulo de negocio
│   │       │   ├── auth/             # login, setup inicial, recuperación
│   │       │   ├── pos/              # venta rápida + calculadora de vuelto
│   │       │   ├── cash-register/    # apertura, cierre, historial
│   │       │   ├── expenses/
│   │       │   ├── boletas/          # ingreso de equipos + clientes
│   │       │   ├── quotes/
│   │       │   ├── notes/
│   │       │   ├── dashboard/
│   │       │   └── settings/
│   │       ├── components/           # UI compartida (Button, Modal, Input, Table…)
│   │       ├── lib/                  # cliente API, hooks, fechas
│   │       └── styles/
│   │
│   ├── server/                       # API — Fastify + better-sqlite3 + Drizzle
│   │   ├── src/
│   │   │   ├── index.ts              # bootstrap
│   │   │   ├── app.ts                # registro de plugins y módulos
│   │   │   ├── config.ts             # env vars validadas con zod
│   │   │   ├── db/
│   │   │   │   ├── client.ts
│   │   │   │   ├── schema.ts
│   │   │   │   └── migrations/
│   │   │   ├── modules/              # espejo de features/ del frontend
│   │   │   │   ├── auth/
│   │   │   │   ├── sales/
│   │   │   │   ├── cash-register/
│   │   │   │   ├── expenses/
│   │   │   │   ├── boletas/
│   │   │   │   ├── quotes/
│   │   │   │   ├── notes/
│   │   │   │   ├── settings/
│   │   │   │   └── printing/         # cola print_jobs + WebSocket del puente
│   │   │   │   # patrón por módulo: routes.ts + service.ts + repository.ts
│   │   │   ├── jobs/                 # node-cron: cierre automático, backup diario
│   │   │   └── lib/                  # errores tipados, helpers
│   │   └── tests/
│   │
│   └── print-bridge/                 # servicio en la PC del taller
│       ├── package.json
│       └── src/
│           ├── index.ts              # conexión WS + reconexión con backoff
│           ├── printer.ts            # envío ESC/POS a la ticketera
│           └── config.ts             # URL del servidor, token, impresora destino
│
├── packages/
│   └── shared/                       # contrato común de las 3 apps
│       └── src/
│           ├── schemas/              # zod: DTOs por módulo (validan API y formularios)
│           ├── tickets/              # tipos de payload + render ESC/POS + preview HTML
│           └── money.ts              # colones como enteros + formateo ₡
│
└── deploy/
    ├── Caddyfile                     # reverse proxy + HTTPS automático
    ├── docker-compose.yml            # server + caddy; volumen para SQLite y backups
    └── backup.sh                     # respaldo diario + rotación 30 días
```

**Principio de extensibilidad:** agregar un módulo futuro (p. ej. inventario) = nueva carpeta en `web/src/features/`, nueva carpeta en `server/src/modules/`, nuevos esquemas en `shared/schemas/`. Nada existente se toca.

## 8. Manejo de errores

- Validación zod en cada endpoint; los mismos esquemas validan los formularios en el frontend (mensajes en español).
- Errores tipados del dominio (p. ej. `CajaYaAbierta`, `CajaNoAbierta`) mapeados a respuestas HTTP consistentes `{ error: { code, message } }`.
- Operaciones documento+consecutivo dentro de una transacción SQLite — o se crea todo o nada.
- Impresión: reintentos en el puente; trabajos `failed` visibles y reimprimibles desde la UI; nunca bloquea la operación.
- Cierre automático: si el servidor estuvo caído a la hora programada, al arrancar detecta la caja abierta vencida y la cierra retroactivamente con la hora programada.

## 9. Testing

- **Unitario (Vitest):** cálculo de vuelto, totales de cierre por método de pago, consecutivos sin huecos bajo concurrencia, formateo de colones, render de tickets (payload → líneas).
- **Integración:** endpoints de la API con SQLite en memoria (flujo completo: abrir caja → vender → gastar → cerrar).
- **Puente:** conversión payload → bytes ESC/POS contra fixtures.

## 10. Despliegue y operación

- VPS Ubuntu con Docker Compose (`server` + `caddy`) o Node + systemd; volumen persistente para `data/sipnato.db` y `/backups`.
- Backup diario vía job interno usando la API de backup de better-sqlite3 (copia consistente, no `cp` del archivo vivo); rotación de 30 días; descarga manual desde Configuración.
- Puente en la PC del taller: se instala como servicio de Windows (NSSM o tarea programada al inicio) apuntando al dominio del servidor con su token.

## 11. Fuera de alcance (explícito)

- Facturación electrónica de Hacienda (Costa Rica).
- Inventario / catálogo de productos / control de stock.
- Multi-usuario, roles y permisos.
- Multi-moneda (solo CRC).
- Estados de workflow y abonos en boletas.
- Notificaciones automáticas a clientes (WhatsApp/SMS/correo).
- Multi-sucursal.
