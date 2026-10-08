# Actualizar Dosuxsoft POS en el VPS

> Comandos para desplegar una versión nueva en el servidor de producción.
> Ruta del proyecto en el VPS: **`/opt/dosuxsoft`**. La instalación desde cero está en [`DEPLOY.md`](DEPLOY.md).

---

## Despliegue normal

```bash
cd /opt/dosuxsoft
git pull
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
```

- `build` reconstruye las dos imágenes: el servidor (Fastify) y Caddy con el frontend compilado. Un cambio
  de pantallas también necesita `build`, no solo `up`.
- Cada negocio tiene su propia base (`/app/data/tenants/<slug>.db`). Al abrirla por primera vez después de
  actualizar, el servidor:
  1. guarda una copia `backups/<slug>/pre-migracion-<fecha>.db` si hay migraciones pendientes, y
  2. aplica las migraciones sin borrar datos.
- En el navegador, **Ctrl+Shift+R** para descartar el frontend viejo en caché.

### Si un cambio de frontend no aparece

```bash
cd /opt/dosuxsoft
docker compose -f deploy/docker-compose.yml build --no-cache
docker compose -f deploy/docker-compose.yml up -d --force-recreate
```

---

## Primera actualización a la versión multi-negocio (Fases A–F)

Si el servidor todavía corre la versión de un solo negocio (`/app/data/dosuxsoft.db`):

1. **Respaldo manual** del volumen antes de tocar nada:
   ```bash
   docker run --rm --volumes-from deploy-server-1 -v /opt/dosuxsoft:/host alpine \
     cp /app/data/dosuxsoft.db /host/dosuxsoft-antes-de-fase-a.db
   ```
2. Agregar `BCCR_API_TOKEN` a `deploy/.env` (las variables `SESSION_SECRET` y `ALLOWED_ORIGIN` ya no se usan;
   pueden quedarse o borrarse).
3. Desplegar como siempre (arriba).
4. Convertir la base anterior en el negocio `taller`: [`DEPLOY.md` §8 → Migrar una base de datos de la versión
   anterior](DEPLOY.md#migrar-una-base-de-datos-de-la-versión-anterior-un-solo-negocio).
5. Crear la cuenta del panel (`superadmin.js create`) y entrar a `https://admin.dosuxsoft.com`.

---

## Verificación post-despliegue

```bash
# Commit desplegado
cd /opt/dosuxsoft && git log --oneline -1

# Logs del servidor (migraciones, errores, tipo de cambio del BCCR)
docker compose -f deploy/docker-compose.yml logs server --tail=80

# Negocios registrados
docker exec -it deploy-server-1 node apps/server/dist/scripts/tenant.js list
```

**Diagnóstico de la base de un negocio** (migraciones aplicadas y tablas):

```bash
docker compose -f deploy/docker-compose.yml exec server sh -c "cd /app/apps/server && node -e \"const D=require('better-sqlite3');const db=new D('/app/data/tenants/taller.db',{readonly:true});console.log('migraciones:',db.prepare('SELECT count(*) c FROM __drizzle_migrations').get().c);console.log('tablas:',db.prepare(\\\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\\\").all().map(r=>r.name).join(', '))\""
```

> El `cd /app/apps/server` es obligatorio: pnpm instala `better-sqlite3` en `/app/apps/server/node_modules`.

---

## Notas

- **Datos:** `/app/data/control.db` (negocios, pagos de la mensualidad, cuentas del panel) y
  `/app/data/tenants/<slug>.db` (un archivo por negocio), dentro del volumen `dosuxsoft-data`.
- **Backups:** `/app/data/backups/<slug>/` y `/app/data/backups/_control/`, diarios con rotación de 30 días.
  `deploy/backup.sh` los copia al host en `/opt/dosuxsoft/backups/`.
- Las migraciones están en `apps/server/src/db/migrations/` y deben estar en `meta/_journal.json` con un
  `when` mayor que la anterior; una migración que no esté en el journal **no se aplica**.
