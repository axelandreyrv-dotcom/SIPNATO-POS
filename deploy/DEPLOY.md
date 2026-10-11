# Guía de Despliegue — Dosuxsoft POS en Cloudflare

El sistema corre completo en Cloudflare: un Worker (`dosuxsoft`), un Durable Object SQLite por negocio, otro
para la plataforma, R2 para los respaldos y Static Assets para el frontend. No hay servidor que mantener,
ni Docker, ni SSH.

```
*.dosuxsoft.com ──► Worker "dosuxsoft" ──► admin.*  → PlatformDO (panel, /internal/ops, /health)
                                       └─► <slug>.* → TenantDO    (un negocio = una BD)
```

Los comandos de `wrangler` y de `pnpm ops` se ejecutan desde `apps/server` (o con
`pnpm --filter @sipnato/server …` desde la raíz). Antes de cada comando que cambie algo, confirmar la cuenta con
`npx wrangler whoami`.

---

## 1. Requisitos previos

- Cuenta de Cloudflare con el plan **Workers Paid** ($5/mes): Durable Objects con SQLite lo exigen.
- La zona `dosuxsoft.com` en esa misma cuenta.
- Node y pnpm; `pnpm install` en la raíz del repositorio (también compila `packages/shared`).
- `openssl` para generar el token de operaciones (Git Bash en Windows lo trae).
- `seitcr.com` y su Worker `seitcr` viven en la misma cuenta: **no se tocan**. Este Worker se llama `dosuxsoft`
  y su ruta es solo `*.dosuxsoft.com/*`.

---

## 2. Configuración inicial (una sola vez)

### 2.1 Iniciar sesión
```bash
cd apps/server
npx wrangler login
npx wrangler whoami        # verificar que es la cuenta correcta
```

### 2.2 Activar R2 y crear el bucket de respaldos
R2 hay que **activarlo primero en el panel de Cloudflare** (R2 → activar / contratar el plan de R2, que tiene
capa gratuita). Mientras no esté activado, `wrangler r2 bucket create` falla con el código 10042
("Please enable R2 through the Cloudflare Dashboard").

```bash
npx wrangler r2 bucket create dosuxsoft-backups
# Los respaldos diarios se borran solos a los 30 días:
npx wrangler r2 bucket lifecycle add dosuxsoft-backups expire-30d --expire-days 30
```

### 2.3 Secretos
```bash
# Token de la consola de operaciones: 64 caracteres hexadecimales.
openssl rand -hex 32
npx wrangler secret put OPS_TOKEN        # pegar el valor cuando lo pida

# Token Bearer del API SDDE del BCCR (tipo de cambio). Opcional: sin él, cada negocio usa su
# tipo de cambio de respaldo de Configuración.
npx wrangler secret put BCCR_API_TOKEN
```

Guardar el `OPS_TOKEN` en un lugar seguro fuera del repositorio (gestor de contraseñas o un archivo local
ignorado por git). **Quien tiene este token administra toda la plataforma**: es el equivalente a la llave SSH
del servidor anterior. Nunca se escribe en un archivo versionado ni se pasa como argumento de un comando.

---

## 3. DNS

En la zona `dosuxsoft.com` de Cloudflare, el registro comodín `*` debe quedar así:

| Tipo | Nombre | Contenido | Proxy |
|---|---|---|---|
| `AAAA` | `*` | `100::` | **Proxied** (nube naranja) |

`100::` es una dirección de descarte: el tráfico nunca sale a ese destino porque el Worker contesta antes.
Universal SSL cubre `*.dosuxsoft.com` sin costo y sin configurar nada más (no hace falta emitir certificados
por negocio).

**No tocar** ningún otro registro: `dosuxsoft.com`, `www`, los registros de correo y todo lo de `seitcr.com`
siguen como están ("Solo DNS" donde ya estaban). Si existía un `A *` del servidor anterior, se reemplaza por el
`AAAA` de arriba.

---

## 4. Desplegar

```bash
cd apps/server
pnpm run deploy
```

Importante: **`pnpm run deploy`, con `run`**. Sin `run`, pnpm trata `deploy` como su propio comando. El script
`predeploy` compila `packages/shared` y el frontend (`apps/web/dist`) antes de `wrangler deploy`; si se llama a
`wrangler deploy` directamente, hay que compilar antes con `pnpm --filter @sipnato/shared build && pnpm --filter @sipnato/web build`.

El mismo comando se usa para la primera vez y para toda actualización. Después de desplegar, comprobar en el
panel de Cloudflare (Workers) que `seitcr` no cambió.

Verificar:

```bash
curl https://admin.dosuxsoft.com/health        # responde estado "ok"
curl -i https://noexiste.dosuxsoft.com/api/auth/me   # 404 NEGOCIO_NO_ENCONTRADO
```

`/health` existe **solo** en `admin.dosuxsoft.com`; desde un negocio da 404 a propósito.

---

## 5. Primer superadministrador

Las cuentas del panel se crean solo con la consola de operaciones (no hay alta por la web). Desde `apps/server`:

```bash
# bash
export OPS_TOKEN=<el token del paso 2.3>
pnpm ops superadmin-create username=admin
```
```powershell
# PowerShell
$env:OPS_TOKEN = '<el token del paso 2.3>'
pnpm ops superadmin-create username=admin
```

Imprime una **contraseña temporal** (se muestra una sola vez). Entrar a `https://admin.dosuxsoft.com`, cambiarla
en **Configuración → Mi contraseña** y, en **Configuración → Cobro**, poner la mensualidad por defecto y cómo
pagar (SINPE, cuenta).

Otros comandos de la consola, todos con `pnpm ops <comando> clave=valor`:

| Comando | Argumentos | Qué hace |
|---|---|---|
| `superadmin-list` | — | Lista las cuentas del panel (sin hashes) |
| `superadmin-reset` | `username=` | Contraseña temporal nueva, desbloquea y cierra sus sesiones |
| `superadmin-disable` / `superadmin-enable` | `username=` | Desactiva o reactiva la cuenta |
| `tenant-list` | — | Lista los negocios (lee solo la plataforma: sirve aunque un negocio esté caído) |
| `tenant-create` | `slug= name=` | Crea un negocio y devuelve su código de activación |
| `tenant-suspend` / `tenant-activate` | `slug=` | Suspende o reactiva un negocio |
| `setup-code` | `slug=` | Código de activación nuevo (si se perdió y el negocio aún no tiene dueño) |
| `reset-owner` | `slug=` | Restablece al dueño: contraseña temporal y recovery code nuevos, cierra sus sesiones |
| `bookmarks` | `slug=` | Bookmark actual y los guardados antes de cada migración |
| `restore-tenant` | `slug= bookmark=` | Restaura el negocio a un bookmark de PITR (ver sección 8) |

La consola apunta por defecto a `https://admin.dosuxsoft.com`; `--url <base>` cambia el destino (solo
`https`, o `http` hacia localhost). Cada llamada, también las rechazadas, queda en la bitácora del panel como
`OPS_…`. Tras 10 intentos fallidos desde una IP en 15 minutos responde 429.

---

## 6. Crear negocios

Desde el panel **`https://admin.dosuxsoft.com`** → **Nuevo negocio**: subdominio (minúsculas, dígitos y
guiones), **tipo de negocio y módulos**, contacto para el cobro y hasta cuándo está pagado. El panel muestra el
**código de activación** (`XXXX-XXXX-XXXX-XXXX`, de un solo uso) con un botón para enviarlo por WhatsApp.
Cada negocio nace con su propio Durable Object y su propia base de datos; no hay que configurar DNS ni
certificados.

El dueño abre `https://<slug>.dosuxsoft.com` → `/setup`, ingresa el código y crea su usuario (nombre, usuario y
contraseña). Después crea administradores y cajeros desde **Usuarios**.

> Guardar el **recovery code** que aparece UNA sola vez: es la única forma de recuperar al dueño si olvida la
> contraseña (si se pierde, `pnpm ops reset-owner slug=<slug>`). Admins y cajeros no tienen recovery code: los
> restablece el dueño (o un admin, para cajeros) desde Usuarios.

El tipo y los módulos se cambian después desde el detalle del negocio; el dueño solo los ve. Cada pago se
registra en el negocio y corre su vencimiento. Un atraso **no bloquea** al negocio: el dueño y los
administradores ven un aviso, y la suspensión es manual desde el panel. Un subdominio que no corresponde a un
negocio activo muestra "Negocio no encontrado" o "Acceso suspendido".

Si el Durable Object de un negocio falla, el panel lo muestra como "No disponible" y sigue funcionando para los
demás.

---

## 7. Actualizar

Se vuelve a ejecutar `pnpm run deploy` desde `apps/server`. Las migraciones **corren solas** la próxima vez
que cada negocio despierte: antes de aplicar una migración a un negocio con datos, el sistema guarda un
bookmark de recuperación (`pre-migracion:<tag>`). No hay ventana de mantenimiento ni pasos manuales.

Si una migración falla, ese negocio no arranca (responde error) hasta que se despliegue una corrección; los
demás no se afectan.

Una migración nueva se escribe a mano (ver `CLAUDE.md` §7): archivo `.sql`, entrada en `_journal.json` y en la
lista de `src/db/migrations.ts`.

---

## 8. Restaurar un negocio (PITR)

Cada Durable Object guarda 30 días de historia (Point-in-Time Recovery). El procedimiento:

1. **Si el problema es una migración defectuosa, desplegar primero la corrección.** Si no, el negocio volvería a
   intentar la misma migración apenas se reinicie tras la restauración.
2. Listar los puntos disponibles:
   ```bash
   pnpm ops bookmarks slug=taller
   ```
   Devuelve el bookmark actual y los `pre-migracion` (el estado justo antes de cada migración con datos).
3. Restaurar:
   ```bash
   pnpm ops restore-tenant slug=taller bookmark=<bookmark>
   ```
   El Durable Object se reinicia en el punto indicado. La respuesta incluye un `undoBookmark`: con ese mismo
   comando se puede deshacer la restauración si no era lo que se buscaba.

La restauración **no se puede probar en local** (el runtime de desarrollo no tiene PITR). Hacer un simulacro en
producción con un negocio de prueba antes de depender de ella (ver el checklist).

---

## 9. Respaldos

| Copia | Qué contiene | Dónde | Retención |
|---|---|---|---|
| PITR | Todo el estado de cada Durable Object | Cloudflare (automático) | 30 días |
| Exportación diaria | JSON de cada negocio activo y de la plataforma, a las 03:00 hora de CR (`0 9 * * *` UTC) | R2, bucket `dosuxsoft-backups`: `tenants/<slug>/<fecha>.json` y `_control/<fecha>.json` | 30 días (regla de vida) |
| Descarga del dueño | JSON de su negocio, desde **Configuración → Respaldo** (5 por hora) | El navegador del dueño | La que él decida |

Los JSON excluyen las sesiones pero **contienen datos confidenciales** (hashes de usuarios, contraseñas de
equipos de clientes en texto plano): guardarlos en un lugar seguro. Para ver o bajar los de R2 se usa el panel
de Cloudflare (R2 → `dosuxsoft-backups`) o `npx wrangler r2 object get dosuxsoft-backups/tenants/<slug>/<fecha>.json --remote`.
El JSON es la copia externa; la restauración se hace con PITR.

---

## 10. Desarrollo local

```bash
pnpm install
cp apps/server/.dev.vars.example apps/server/.dev.vars    # completar OPS_TOKEN (y BCCR_API_TOKEN si se quiere)
pnpm dev                                                  # Worker en :8787 (wrangler dev) + web en :5174
```

- El Worker local usa el entorno `dev` de `wrangler.jsonc` (`ENVIRONMENT=development`, dominio `localhost`) y
  guarda su estado en `apps/server/.wrangler/state`. Para empezar de cero, detener `pnpm dev` y borrar esa carpeta.
- El primer superadministrador local (Node no resuelve `*.localhost`, por eso la IP):
  ```bash
  OPS_TOKEN=<el de .dev.vars> pnpm --filter @sipnato/server ops superadmin-create username=admin --url http://127.0.0.1:8787
  ```
- Panel: `http://admin.localhost:5174`. Negocio: `http://<slug>.localhost:5174` → `/setup` con el código de
  activación que muestra el panel. `http://localhost:5174` usa el negocio `DEV_TENANT` (`taller`).
- El Worker de desarrollo toma el negocio de `X-Forwarded-Host` (lo manda el proxy de Vite). Con `curl`
  directo a :8787 hay que mandar ese header a mano.
- Verificaciones: `pnpm lint`, `pnpm format:check`, `pnpm -r exec tsc --noEmit` y
  `pnpm --filter @sipnato/server test` (corre dentro de `workerd`).
- Nunca usar `--env dev` para desplegar: el entorno `dev` no tiene rutas y existe solo para el desarrollo local.

---

## 11. Impresión de tickets en la PC del negocio (sin software adicional)

La app imprime directamente desde el navegador — no requiere instalar ningún servicio local.

### Configurar la impresora en Windows

1. Conectar la Epson TM-T20II por USB e instalar los drivers de Epson.
2. En Windows: **Configuración → Bluetooth y dispositivos → Impresoras** → verificar que aparece como impresora disponible.
3. Establecerla como **impresora predeterminada** (clic derecho → "Establecer como predeterminada").

### Imprimir un ticket

En el módulo POS, cada fila de venta tiene el ícono de impresora. Al hacer clic:
- Se abre el diálogo de impresión del navegador.
- Seleccionar la Epson TM-T20II.
- El ticket sale en formato 80mm automáticamente.

**Consejo:** En Chrome, la primera vez que imprimes, desactivar "Encabezados y pies de página" y guardar la configuración para esa impresora. Las siguientes veces no se muestra el diálogo si ya está guardado como predeterminado.

---

## 12. Checklist de seguridad post-despliegue

- [ ] Contraseña temporal del panel cambiada (`admin`) y mensualidad por defecto configurada
- [ ] `OPS_TOKEN` guardado fuera del repositorio; nunca en un archivo versionado
- [ ] `curl https://admin.dosuxsoft.com/health` responde "ok" y `https://<slug>.dosuxsoft.com/health` da 404
- [ ] Headers de seguridad activos en una página y en la API: HSTS, CSP, X-Frame-Options, nosniff — verificar en [securityheaders.com](https://securityheaders.com/?q=https://admin.dosuxsoft.com)
- [ ] Certificado válido en `https://admin.dosuxsoft.com` y en un negocio de prueba
- [ ] `https://noexiste.dosuxsoft.com` responde 404 y `dosuxsoft.com`, `www` y el correo siguen funcionando
- [ ] El Worker `seitcr` no cambió
- [ ] Opcional: regla de WAF (rate limiting) de Cloudflare sobre `/api/*` y `/auth/*` como defensa adicional a los límites del sistema
- [ ] **Simulacro de PITR** con un negocio de prueba: crear datos, anotar `bookmarks`, crear más datos, `restore-tenant` y comprobar que los últimos ya no están (y probar el `undoBookmark`). Luego suspender o borrar ese negocio
- [ ] Respaldo diario presente en R2 al día siguiente (`tenants/<slug>/<fecha>.json` y `_control/<fecha>.json`)
- [ ] Recovery code de cada dueño guardado en un lugar seguro

---

## Comandos de mantenimiento frecuentes

```bash
cd apps/server

# Ver logs en vivo del Worker y los Durable Objects
npx wrangler tail

# Secretos
npx wrangler secret list
npx wrangler secret put OPS_TOKEN      # rotar el token de operaciones

# Respaldos en R2
npx wrangler r2 object get dosuxsoft-backups/_control/2026-10-10.json --remote

# Estado de los negocios
pnpm ops tenant-list
```
