# Dosuxsoft POS

Punto de venta web para negocios en Costa Rica: talleres de celulares o electrónica, talleres mecánicos,
tiendas y otros. Cada negocio tiene **su propia base de datos** y entra por su subdominio HTTPS
(`taller.dosuxsoft.com`); la plataforma se administra desde `admin.dosuxsoft.com`.

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
| **Cotizaciones, facturas, apartados y créditos** | Con abonos, saldos y vencimientos. Cada negocio activa los módulos que usa |
| **Gastos y reportes** | Gastos de la caja, reportes por período con gráfico diario y exportación CSV, dashboard del día |
| **Avisos por WhatsApp** | Orden recibida / lista, recordatorio de cobro, comprobante de abono y cotización, con plantillas editables |
| **Usuarios y roles** | Dueño, administradores y cajeros (con PIN). Acciones sensibles del cajero requieren autorización de un supervisor |
| **Panel de la plataforma** | Alta de negocios con código de activación, cobro manual de la mensualidad (SINPE / transferencia), avisos de vencimiento y suspensión |

Los tickets de 80 mm y las cotizaciones se imprimen desde el navegador (`window.print()`) en la impresora
predeterminada de Windows. No hay que instalar nada en la PC del negocio.

Fuera de alcance por decisión del proyecto: facturación electrónica de Hacienda e IVA.

---

## Stack

| Paquete | Tecnología |
|---|---|
| `apps/web` | React 19, Vite 6, Tailwind CSS v4, TanStack Router y Query, Recharts |
| `apps/server` | Fastify 5, better-sqlite3, Drizzle ORM, argon2id, node-cron |
| `packages/shared` | Esquemas Zod y utilidades compartidas (montos en ₡, plantillas, fechas de la suscripción) |

Infraestructura: VPS Ubuntu · Docker Compose · Caddy (HTTPS automático por subdominio) · SQLite en WAL.

```
[Navegador: SPA en <negocio>.dosuxsoft.com]  ──window.print()──►  ticketera 80 mm
        │ HTTPS (Caddy)
        ▼
   API Fastify ── Host → negocio ── /app/data/tenants/<slug>.db   (un archivo por negocio)
        │                          /app/data/control.db            (negocios, mensualidades, panel)
        └── node-cron: cierre de caja, backups, limpieza de sesiones, tipo de cambio BCCR
```

---

## Desarrollo

```bash
git clone https://github.com/axelandreyrv-dotcom/SIPNATO-POS.git
cd SIPNATO-POS
pnpm install            # también compila packages/shared
pnpm dev                # servidor :3000 + web :5174
```

La base de desarrollo empieza vacía (`apps/server/data/`). Para crear un negocio y la cuenta del panel:

```bash
pnpm --filter @sipnato/server tenant create taller "Taller de prueba"   # imprime el código de activación
pnpm --filter @sipnato/server superadmin create dev-admin              # imprime una contraseña temporal
```

- Negocio: `http://taller.localhost:5174` → `/setup` con el código de activación.
- Panel: `http://admin.localhost:5174`.
- Opcional: `pnpm --filter @sipnato/server db:seed taller` agrega datos de ejemplo.
- Variables opcionales en `apps/server/.env` (ver [`apps/server/.env.example`](apps/server/.env.example)).

Verificaciones:

```bash
pnpm lint
pnpm --filter @sipnato/server test
pnpm build
```

---

## Producción

Guía completa: [`deploy/DEPLOY.md`](deploy/DEPLOY.md). Actualizaciones: [`deploy/ACTUALIZAR-VPS.md`](deploy/ACTUALIZAR-VPS.md).

```bash
git clone https://github.com/axelandreyrv-dotcom/SIPNATO-POS.git /opt/dosuxsoft
cd /opt/dosuxsoft/deploy
cp .env.example .env     # BCCR_API_TOKEN (opcional)
docker compose build && docker compose up -d
docker exec -it deploy-server-1 node apps/server/dist/scripts/superadmin.js create axel
```

---

## Seguridad

- Una base de datos por negocio; el negocio se resuelve solo en el servidor, desde el subdominio.
  El panel (`admin.`) no expone rutas de negocio y viceversa.
- Contraseñas, PIN, códigos de activación y de recuperación con **argon2id**; bloqueo tras 5 intentos.
- Sesiones: token aleatorio en cookie `HttpOnly + Secure + SameSite=Strict`, 8 h absolutas y 60 min de
  inactividad. Sin CORS: cada interfaz llama a su API en su mismo origen.
- Rate limiting por negocio + IP; headers HSTS, CSP, X-Frame-Options en Caddy.
- Ventas y gastos con borrado lógico; bitácora de solo inserción por negocio y otra para el panel.
- Backups diarios por negocio y de la plataforma, copia antes de cada migración.
- Scripts de emergencia por SSH: `reset-admin.js <negocio>`, `superadmin.js reset <usuario>`.

---

## Estructura

```
apps/server/src/
  db/           schema Drizzle, migraciones, control.db, cliente por negocio, seed
  jobs/         cierre automático, backups, limpieza de sesiones, tipo de cambio
  lib/          errores, crypto, sesiones, hora de CR, cliente del BCCR
  middleware/   negocio por Host, auth y roles, autorización de supervisor, módulos, panel
  modules/      un módulo por dominio (routes + service + repository), incluido platform/
  scripts/      tenant, superadmin, reset-admin
  tests/        tests de integración (node:test)
apps/web/src/
  features/     una carpeta por módulo, incluido platform/ (panel)
  routes/       TanStack Router (login, setup, _auth/*)
  components/   piezas compartidas (gráfico de ventas, WhatsApp, autorización…)
packages/shared/src/
  schemas/      contratos Zod compartidos por web y servidor
deploy/         docker-compose, Caddyfile, backup.sh, guías
```

`CLAUDE.md` documenta las reglas del proyecto y `ROADMAP.md` el historial de fases.
