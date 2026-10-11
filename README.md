# Dosuxsoft POS

Punto de venta web para negocios en Costa Rica: talleres de celulares o electrónica, talleres mecánicos,
tiendas y otros. Cada negocio tiene **su propia base de datos** y entra por su subdominio HTTPS
(`taller.dosuxsoft.com`); la plataforma se administra desde `admin.dosuxsoft.com`. Corre completo en
**Cloudflare Workers**.

**País:** Costa Rica · **Moneda:** colones (₡), con cobro en dólares convertido a colones

---

## Qué incluye

| Módulo | Descripción |
|---|---|
| **Punto de venta** | Venta por monto libre o carrito con productos del inventario y líneas libres. Efectivo (con vuelto), SINPE, tarjeta, transferencia y dólares (tipo de cambio del BCCR, vuelto en colones) |
| **Caja** | Apertura y cierre con arqueo por método, dólares en caja, cierre automático programable |
| **Inventario** | Productos con código de barras, stock, entradas de mercadería y ajustes con motivo, historial. Vender sin stock avisa y permite |
| **Órdenes de servicio** | Boletas con campos según el tipo de negocio (IMEI, placa, serie…), editables por el dueño |
| **Clientes** | Historial de órdenes por cliente, búsqueda por nombre, teléfono o campos de la orden |
| **Cotizaciones, facturas, apartados y créditos** | Con abonos, saldos y vencimientos. Los módulos de cada negocio se asignan desde el panel |
| **Gastos y reportes** | Gastos de la caja, reportes por período con gráfico diario y exportación CSV, dashboard del día |
| **Avisos por WhatsApp** | Orden recibida / lista, recordatorio de cobro, comprobante de abono y cotización, con plantillas editables |
| **Usuarios y roles** | Dueño, administradores y cajeros (con PIN). Acciones sensibles del cajero requieren autorización de un supervisor |
| **Panel de la plataforma** | Alta de negocios con su tipo, módulos y código de activación, cobro manual de la mensualidad (SINPE / transferencia), avisos de vencimiento y suspensión |

Los tickets de 80 mm y las cotizaciones se imprimen desde el navegador (`window.print()`) en la impresora
predeterminada de Windows. No hay que instalar nada en la PC del negocio.

Fuera de alcance por decisión del proyecto: facturación electrónica de Hacienda e IVA.

---

## Stack

| Paquete | Tecnología |
|---|---|
| `apps/web` | React 19, Vite 6, Tailwind CSS v4, TanStack Router y Query, Recharts |
| `apps/server` | Cloudflare Workers, Durable Objects con SQLite, Hono, Drizzle ORM (`durable-sqlite`), argon2id en WebAssembly |
| `packages/shared` | Esquemas Zod y utilidades compartidas (montos en ₡, plantillas, fechas de la suscripción) |

Infraestructura: Cloudflare Workers (plan Workers Paid) · un Durable Object SQLite por negocio y otro para la
plataforma · R2 para los respaldos · Static Assets para el frontend · Universal SSL para `*.dosuxsoft.com`.

```
[Navegador: SPA en <negocio>.dosuxsoft.com]  ──window.print()──►  ticketera 80 mm
        │ HTTPS (Cloudflare)
        ▼
   Worker "dosuxsoft" ── Host → destino ──┬─ admin.*  → PlatformDO  (negocios, mensualidades, panel)
        │                                 └─ <slug>.* → TenantDO    (todos los datos de ese negocio)
        └── Cron Triggers y alarmas: cierre de caja, tipo de cambio BCCR, mantenimiento y respaldos a R2
```

---

## Desarrollo

```bash
git clone https://github.com/axelandreyrv-dotcom/SIPNATO-POS.git
cd SIPNATO-POS
pnpm install            # también compila packages/shared
cp apps/server/.dev.vars.example apps/server/.dev.vars   # completar OPS_TOKEN (openssl rand -hex 32)
pnpm dev                # Worker (wrangler dev) en :8787 + web en :5174
```

El estado local vive en `apps/server/.wrangler/state` (para empezar de cero: detener `pnpm dev` y borrar la
carpeta). Para crear la cuenta del panel y un negocio:

```bash
# Node no resuelve *.localhost: la consola se apunta a la IP
OPS_TOKEN=<el de .dev.vars> pnpm --filter @sipnato/server ops superadmin-create username=admin --url http://127.0.0.1:8787
```

- Panel: `http://admin.localhost:5174` → crear un negocio, copiar su código de activación.
- Negocio: `http://<slug>.localhost:5174` → `/setup` con el código de activación.
- `http://localhost:5174` usa el negocio `DEV_TENANT` (`taller`).
- Variables y secretos: [`apps/server/.dev.vars.example`](apps/server/.dev.vars.example) y `apps/server/wrangler.jsonc`.

Verificaciones:

```bash
pnpm lint
pnpm format:check
pnpm -r exec tsc --noEmit
pnpm --filter @sipnato/server test    # corre dentro de workerd, con Durable Objects reales
```

---

## Producción

Guía completa (activar R2, secretos, DNS, primer superadministrador, restauración, checklist):
[`deploy/DEPLOY.md`](deploy/DEPLOY.md).

```bash
cd apps/server
npx wrangler secret put OPS_TOKEN        # una vez; también BCCR_API_TOKEN (opcional)
pnpm run deploy                          # con "run": compila shared y web, y despliega el Worker
pnpm ops superadmin-create username=admin   # con OPS_TOKEN en el entorno
```

Actualizar es volver a ejecutar `pnpm run deploy`: las migraciones corren solas en cada negocio.

---

## Seguridad

- Una base de datos (Durable Object) por negocio; el negocio se resuelve solo en el servidor, desde el subdominio.
  El panel (`admin.`) no expone rutas de negocio y viceversa.
- Contraseñas, PIN, códigos de activación y de recuperación con **argon2id**; bloqueo tras 5 intentos.
- Sesiones: token aleatorio en cookie `HttpOnly + Secure + SameSite=Strict`, 8 h absolutas y 60 min de
  inactividad. Sin CORS: cada interfaz llama a su API en su mismo origen, y toda escritura exige origen propio
  y `application/json` (protección CSRF).
- Rate limiting por negocio + IP; headers HSTS, CSP y X-Frame-Options en `apps/web/public/_headers` y en el Worker.
- Ventas y gastos con borrado lógico; bitácora de solo inserción por negocio y otra para el panel.
- Respaldos: recuperación a un punto en el tiempo (30 días), exportación JSON diaria a R2 y descarga del dueño.
  Antes de cada migración se guarda un punto de restauración.
- Operaciones de emergencia por la consola `pnpm ops` (endpoint `/internal/ops` protegido por `OPS_TOKEN`):
  cuentas del panel, negocios, restablecer al dueño y restaurar un negocio.

---

## Estructura

```
apps/server/
  wrangler.jsonc  Worker, Durable Objects, R2, crons y Static Assets
  scripts/        ops.ts (consola de operaciones)
  src/
    worker.ts     enrutador por Host y Cron Triggers
    do/           TenantDO (un negocio) y PlatformDO (la plataforma)
    tenant-app.ts, platform-app.ts   apps Hono de cada tipo de DO
    db/           schema Drizzle, migraciones, contexto por negocio y de la plataforma
    lib/          errores, crypto, sesiones, límites de intentos, hora de CR, cliente del BCCR
    middleware/   auth y roles, autorización de supervisor, módulos, panel
    modules/      un módulo por dominio (routes + service + repository), incluidos platform/ y ops/
    tests/        tests de integración (vitest en workerd)
apps/web/src/
  features/       una carpeta por módulo, incluido platform/ (panel)
  routes/         TanStack Router (login, setup, _auth/*)
  components/     piezas compartidas (gráfico de ventas, WhatsApp, autorización…)
apps/web/public/  _headers (headers de seguridad y caché)
packages/shared/src/
  schemas/        contratos Zod compartidos por web y servidor
deploy/           DEPLOY.md
```

`CLAUDE.md` documenta las reglas del proyecto y `ROADMAP.md` el historial de fases.
