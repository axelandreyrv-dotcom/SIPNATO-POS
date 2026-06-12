# Guía de Despliegue — Dosuxsoft POS

## Requisitos previos

- VPS Ubuntu 22.04 / 24.04 LTS (mínimo 1 vCPU, 1 GB RAM, 20 GB disco)
- Dominio `dosuxsoft.com` apuntando al IP del VPS (registro A para `@` y `www`)
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

Completar `SESSION_SECRET` con un valor aleatorio seguro:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
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

Caddy obtiene el certificado HTTPS automáticamente en el primer inicio (requiere que el DNS ya apunte al VPS).

---

## 7. Verificar el despliegue

```bash
# Health check del servidor (ruta directa — no lleva /api)
curl https://www.dosuxsoft.com/health

# Debe responder: {"status":"ok","db":"ok","env":"production",...}
```

Abrir `https://www.dosuxsoft.com` en el navegador → debe aparecer la pantalla de login.

---

## 8. Setup inicial de la cuenta admin

En la primera visita, el sistema redirige a `/setup` para crear el usuario administrador.

> Guardar el **recovery code** que aparece UNA sola vez. Es la única forma de recuperar acceso si olvidás la contraseña.

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

### Print bridge WebSocket (avanzado, opcional)

Si en el futuro se necesita impresión silenciosa sin diálogo, el proyecto incluye `apps/print-bridge/`. Ver la documentación en ese directorio.

---

## 11. Recuperación de emergencia (break-glass)

Si perdiste acceso y no podés ingresar con contraseña ni recovery code:

```bash
# Conectarse al VPS por SSH
ssh root@<IP_DEL_VPS>

# Ejecutar el script dentro del contenedor
docker exec -it deploy-server-1 node apps/server/dist/scripts/reset-admin.js
```

El script imprime una contraseña temporal y un nuevo recovery code. Cambiar la contraseña inmediatamente al iniciar sesión.

---

## 11. Checklist de seguridad post-despliegue

- [ ] `NODE_ENV=production` activo (verificar en `/api/health`)
- [ ] HTTPS forzado — Caddy redirige HTTP → HTTPS automáticamente
- [ ] Headers de seguridad activos — verificar en [securityheaders.com](https://securityheaders.com/?q=https://www.dosuxsoft.com)
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

# Restaurar un backup (el nombre del contenedor depende de la carpeta deploy/)
docker cp dosuxsoft-2026-06-15.db deploy-server-1:/app/data/dosuxsoft.db
docker compose -f deploy/docker-compose.yml restart server
```
