# Guía de Despliegue — Dosuxsoft POS

## Requisitos previos

- VPS Ubuntu 22.04 / 24.04 LTS (mínimo 1 vCPU, 1 GB RAM, 20 GB disco)
- Dominio `dosuxsoft.com` apuntando al IP del VPS: registros A para `@`, `www` **y `*` (comodín)**.
  Cada negocio vive en su propio subdominio (`taller.dosuxsoft.com`, `ferreteria.dosuxsoft.com`…).
  En Cloudflare los tres registros deben quedar en **"Solo DNS"** (nube gris): Caddy emite
  el certificado HTTPS de cada subdominio directamente con Let's Encrypt.
- Docker + Docker Compose instalados en el VPS

---

## 1. Preparar el VPS

### Conectarse y actualizar
```bash
ssh root@<IP_DEL_VPS>
apt update && apt upgrade -y
```

### Instalar Docker
```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
```

### Crear usuario no-root (opcional pero recomendado)
```bash
adduser axel
usermod -aG docker axel
```

---

## 2. Configurar SSH por clave (deshabilitar contraseña)

En tu máquina LOCAL, copiar tu clave pública al VPS:
```bash
ssh-copy-id root@<IP_DEL_VPS>
```

En el VPS, editar `/etc/ssh/sshd_config`:
```
PasswordAuthentication no
PubkeyAuthentication yes
```

Reiniciar SSH:
```bash
systemctl restart sshd
```

> Verificar que podés conectarte con clave ANTES de cerrar la sesión actual.

---

## 3. Configurar el firewall (UFW)

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
ufw status
```

---

## 4. Clonar el repositorio

```bash
mkdir -p /opt/dosuxsoft
cd /opt/dosuxsoft
git clone https://github.com/axelandreyrv-dotcom/SIPNATO-POS.git .
```

---

## 5. Configurar variables de entorno

```bash
cd /opt/dosuxsoft/deploy
cp .env.example .env
nano .env
```

Completar `SESSION_SECRET` con un valor aleatorio seguro (el VPS no trae Node instalado; `openssl` sí):
```bash
openssl rand -hex 48
```

El archivo `.env` final debe verse así:
```
SESSION_SECRET=<96 caracteres hexadecimales aleatorios>
ALLOWED_ORIGIN=https://www.dosuxsoft.com
```

---

## 6. Construir y levantar los contenedores

```bash
cd /opt/dosuxsoft/deploy
docker compose build
docker compose up -d
```

Verificar que todo corre:
```bash
docker compose ps
docker compose logs -f
```

Caddy obtiene el certificado HTTPS de `dosuxsoft.com`/`www` al iniciar, y el de cada negocio
la primera vez que alguien abre su subdominio (requiere que el DNS ya apunte al VPS).

---

## 7. Verificar el despliegue

Primero crear al menos un negocio (sección 8), luego:

```bash
# Health check del servidor (ruta directa — no lleva /api)
curl https://taller.dosuxsoft.com/health

# Debe responder: {"status":"ok","db":"ok","env":"production",...}
```

Abrir `https://taller.dosuxsoft.com` en el navegador → debe aparecer `/setup` (negocio nuevo) o el login.

---

## 8. Crear negocios y su cuenta admin

Cada negocio tiene **su propia base de datos** (`/app/data/tenants/<slug>.db`), sus propias
sesiones y sus propios backups. Nada se comparte entre negocios.

### Panel de la plataforma (recomendado)

Los negocios se crean, cobran y suspenden desde **`https://admin.dosuxsoft.com`**. El DNS comodín
`*.dosuxsoft.com` ya lo cubre y Caddy emite su certificado. Primero crear la cuenta del panel
(solo por consola, no hay alta por web):

```bash
docker exec -it deploy-server-1 node apps/server/dist/scripts/superadmin.js create axel
```

Imprime una contraseña temporal: entrar al panel y cambiarla en **Configuración → Mi contraseña**.
En **Configuración → Cobro** poner la mensualidad por defecto y cómo pagar (SINPE, cuenta).
Otros comandos: `superadmin.js reset <usuario>` (contraseña nueva, desbloquea y cierra sesiones),
`disable` / `enable` / `list`.

En **Nuevo negocio** se elige el subdominio, el contacto para el cobro y hasta cuándo está pagado; el
panel muestra el código de activación con un botón para enviarlo por WhatsApp. Cada pago se registra
en el negocio y corre su vencimiento. Un atraso **no bloquea** al negocio: el dueño y los
administradores ven un aviso, y la suspensión es manual desde el panel.

### Por consola (respaldo)

```bash
# Crear un negocio (slug = subdominio: minúsculas, dígitos y guiones)
docker exec -it deploy-server-1 node apps/server/dist/scripts/tenant.js create taller "Taller Axel"

# Listar / suspender / reactivar
docker exec -it deploy-server-1 node apps/server/dist/scripts/tenant.js list
docker exec -it deploy-server-1 node apps/server/dist/scripts/tenant.js suspend taller
docker exec -it deploy-server-1 node apps/server/dist/scripts/tenant.js activate taller
```

`create` imprime un **código de activación** (`XXXX-XXXX-XXXX-XXXX`). Entregarlo al dueño del negocio
junto con su dirección: `/setup` lo exige, así nadie más puede reclamar la cuenta de un negocio recién
creado. Es de un solo uso; si se pierde antes de usarlo:

```bash
docker exec -it deploy-server-1 node apps/server/dist/scripts/tenant.js setup-code taller
```

Luego abrir `https://taller.dosuxsoft.com` → redirige a `/setup` para ingresar el código y crear el
usuario del **dueño** (nombre, usuario y contraseña). El primer acceso tarda unos segundos mientras
Caddy emite el certificado HTTPS. Después, el dueño crea administradores y cajeros desde **Usuarios**.

> Guardar el **recovery code** que aparece UNA sola vez. Es la única forma de recuperar acceso si el dueño olvida la contraseña. Admins y cajeros no tienen recovery code: los restablece el dueño (o un admin, para cajeros) desde Usuarios.

**Al actualizar desde una versión anterior a la Fase B:** el admin único de cada negocio pasa a ser
el dueño con el usuario **`dueno`** y su misma contraseña. Todas las sesiones se cierran.

Un subdominio que no corresponde a un negocio activo muestra "Negocio no encontrado" o
"Acceso suspendido", y Caddy no emite certificados para él.

### Migrar una base de datos de la versión anterior (un solo negocio)

Si existe un `dosuxsoft.db` de antes de la Fase A, se convierte en un negocio así:

```bash
docker exec -it deploy-server-1 node apps/server/dist/scripts/tenant.js create taller "Taller Axel"
docker compose -f deploy/docker-compose.yml stop server
docker cp dosuxsoft.db deploy-server-1:/app/data/tenants/taller.db
docker compose -f deploy/docker-compose.yml start server   # aplica migraciones pendientes al abrir
```

---

## 9. Configurar backup automático (cron del sistema)

El servidor hace backup interno diariamente a las 3:00 AM CR (guardado en el volumen Docker).

Para tener también una copia en el host (recomendado):
```bash
chmod +x /opt/dosuxsoft/deploy/backup.sh
crontab -e
```

Agregar:
```
0 10 * * * /opt/dosuxsoft/deploy/backup.sh
```

(10:00 UTC = 4:00 AM Costa Rica)

El script guarda los backups en `/opt/dosuxsoft/backups/<negocio>/YYYY-MM-DD.db` con rotación de 30 días por negocio.

---

## 10. Impresión de tickets en la PC del taller (sin software adicional)

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

## 12. Recuperación de emergencia (break-glass)

Si perdiste acceso y no podés ingresar con contraseña ni recovery code:

```bash
# Conectarse al VPS por SSH
ssh root@<IP_DEL_VPS>

# Ejecutar el script dentro del contenedor, indicando el negocio
docker exec -it deploy-server-1 node apps/server/dist/scripts/reset-admin.js taller
```

El script restablece al **dueño** de ese negocio: imprime su usuario, una contraseña temporal y un nuevo recovery code. Cambiar la contraseña inmediatamente al iniciar sesión (Mi cuenta).

---

## 13. Checklist de seguridad post-despliegue

- [ ] `NODE_ENV=production` activo (verificar en `/api/health`)
- [ ] HTTPS forzado — Caddy redirige HTTP → HTTPS automáticamente
- [ ] Headers de seguridad activos — verificar en [securityheaders.com](https://securityheaders.com/?q=https://taller.dosuxsoft.com)
- [ ] SSH por clave confirmado — contraseña deshabilitada
- [ ] UFW activo: `ufw status` muestra solo 22, 80, 443
- [ ] SESSION_SECRET ≠ valor de desarrollo
- [ ] Backup del día 1 descargado y restaurado en local (probar restore, no solo backup)
- [ ] Recovery code del admin guardado en lugar seguro

---

## Comandos de mantenimiento frecuentes

```bash
# Ver logs en tiempo real
docker compose -f /opt/dosuxsoft/deploy/docker-compose.yml logs -f

# Reiniciar el servidor (sin downtime de Caddy)
docker compose -f /opt/dosuxsoft/deploy/docker-compose.yml restart server

# Actualizar a nueva versión
cd /opt/dosuxsoft
git pull
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d

# Restaurar el backup de UN negocio (los demás no se tocan)
docker compose -f deploy/docker-compose.yml stop server
docker cp taller/2026-06-15.db deploy-server-1:/app/data/tenants/taller.db
docker compose -f deploy/docker-compose.yml start server
```
