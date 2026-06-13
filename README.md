# Dosuxsoft POS

Sistema de punto de venta para taller de reparación de celulares y venta de accesorios. Aplicación web privada con autenticación, accesible desde cualquier dispositivo por subdominio HTTPS.

**País:** Costa Rica · **Moneda:** Colones (₡) · **Usuario:** administrador único

---

## Módulos

| Módulo | Descripción |
|---|---|
| **POS** | Registro de ventas con 4 métodos de pago (efectivo, SINPE, tarjeta, transferencia). Calculadora de vuelto para efectivo |
| **Caja** | Apertura y cierre de caja con monto inicial. Cierre automático programable. Resumen de totales por método |
| **Boletas** | Órdenes de reparación con datos del cliente, dispositivo, IMEI (validación Luhn), contraseña y descripción del servicio |
| **Clientes** | Base de datos con historial de boletas por cliente. Búsqueda por nombre, teléfono o IMEI |
| **Cotizaciones** | Presupuestos con múltiples ítems, impresión con datos del negocio. Edición posterior |
| **Apartados** | Reservas tipo layaway con abonos parciales, progreso de pago y cierre automático al completar |
| **Gastos** | Registro de gastos vinculados a la caja activa. Soft-delete con trazabilidad |
| **Reportes** | Ventas por período con gráfica diaria, filtros por método de pago y exportación CSV |
| **Dashboard** | Resumen del día: ventas por método, gastos, balance, estado de caja y contadores |
| **Notas internas** | Bloc de notas personal tipo tarjetas para el administrador |
| **Configuración** | Datos del negocio, leyendas de tickets, cierre automático e impresión de prueba |

> **Impresión:** los tickets de 80mm y las cotizaciones se imprimen directamente desde el navegador (`window.print()`) hacia la Epson predeterminada en Windows. No requiere instalar ningún servicio local.

---

## Stack

### Monorepo (`pnpm` workspaces)

| Paquete | Stack |
|---|---|
| `apps/web` | React 19, Vite 6, Tailwind CSS v4, TanStack Router, TanStack Query, Recharts |
| `apps/server` | Fastify 5, better-sqlite3, Drizzle ORM, argon2id, node-cron |
| `packages/shared` | Schemas Zod compartidos, formateo de moneda ₡ |

### Infraestructura

- **VPS** Ubuntu 22.04 · **Docker Compose** · **Caddy** (HTTPS automático Let's Encrypt)
- **Base de datos** SQLite en WAL mode · backup diario con rotación 30 días
- **Seguridad** argon2id, cookies HttpOnly, rate limiting, headers HSTS/CSP/XFO

---

## Arquitectura

```
[Navegador — SPA React] ──window.print()──► Ticketera 80mm (Epson)
        │ HTTPS (Caddy)
        ▼
   API Fastify ──── node-cron (cierre auto, backup, limpieza sesiones)
        │
        ▼
   SQLite /app/data/dosuxsoft.db  +  /app/data/backups/
```

---

## Correr en desarrollo

```bash
# Clonar e instalar
git clone https://github.com/axelandreyrv-dotcom/SIPNATO-POS.git
cd SIPNATO-POS
pnpm install        # también compila packages/shared automáticamente

# Variables de entorno (el servidor tiene defaults seguros para dev)
# No es necesario .env para ejecutar en desarrollo

# Levantar servidor + web en paralelo
pnpm dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3000/health`

En el primer arranque, el sistema redirige a `/setup` para crear el usuario administrador.

---

## Despliegue en producción

Ver [`deploy/DEPLOY.md`](deploy/DEPLOY.md) para la guía completa paso a paso.

Resumen rápido en un VPS Ubuntu 22.04:

```bash
git clone https://github.com/axelandreyrv-dotcom/SIPNATO-POS.git /opt/dosuxsoft
cd /opt/dosuxsoft/deploy
cp .env.example .env
nano .env                          # completar SESSION_SECRET y ALLOWED_ORIGIN
docker compose build
docker compose up -d
```

Caddy obtiene el certificado HTTPS automáticamente al primer inicio.

---

## Seguridad

- Contraseñas hasheadas con **argon2id** `{ memoryCost: 65536, timeCost: 3 }`
- Sesiones: cookie `HttpOnly + Secure + SameSite=Strict`, expiración 8h + timeout 60min
- Recovery code de emergencia (mostrado una sola vez, hasheado en BD)
- Rate limiting en login (5/15min), recover (3/30min), descarga de backup (5/hora)
- CORS restringido al subdominio de producción
- Headers: HSTS preload, X-Frame-Options DENY, CSP estricto, Referrer-Policy
- Registros financieros con soft-delete (nunca se borran permanentemente)
- Audit log de solo inserción para todas las operaciones críticas
- Script break-glass (`apps/server/src/scripts/reset-admin.ts`) para recuperación de emergencia vía SSH

---

## Estructura de carpetas

```
apps/
  server/           # API Fastify
    src/
      db/           # schema Drizzle, migraciones, cliente SQLite
      jobs/         # cron: auto-close, backup, cleanup-sessions
      lib/          # errors, constantes, cr-time
      middleware/   # auth, security-headers
      modules/      # auth, cash-registers, sales, boletas, customers, expenses,
                    # quotes, apartados, notes, reports, dashboard, settings
      scripts/      # reset-admin (break-glass)
  web/              # SPA React
    src/
      features/     # módulo por feature (POS, caja, boletas, apartados, etc.)
      routes/       # TanStack Router (login, setup, _auth/*)
      components/   # branding, shared UI

packages/
  shared/           # schemas Zod + money.ts (compartido server + web)

deploy/
  Dockerfile            # multi-stage: build → server + caddy
  docker-compose.yml
  Caddyfile             # HTTPS + proxy + security headers
  backup.sh             # backup externo al host
  .env.example
  DEPLOY.md             # guía de despliegue completa
```

---

## Variables de entorno

| Variable | Descripción | Default dev |
|---|---|---|
| `SESSION_SECRET` | Secreto para firmar sesiones (min 64 chars) | valor de dev inseguro |
| `ALLOWED_ORIGIN` | Origen CORS permitido | `http://localhost:5173` |
| `DATABASE_PATH` | Ruta al archivo SQLite | `./data/dosuxsoft.db` |
| `BACKUP_PATH` | Directorio de backups | `./data/backups` |
| `LOG_PATH` | Directorio de logs | `./logs` |
| `PORT` | Puerto Fastify | `3000` |

El servidor **rechaza iniciar en producción** si `SESSION_SECRET` tiene el valor por defecto de desarrollo.
