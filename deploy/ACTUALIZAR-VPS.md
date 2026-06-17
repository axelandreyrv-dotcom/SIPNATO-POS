# Actualizar SIPNATO/Dosuxsoft en el VPS

> Comandos para desplegar cambios nuevos al servidor de producción.
> Ruta del proyecto en el VPS: **`/opt/dosuxsoft`**

---

## Despliegue normal (el que funciona)

```bash
cd /opt/dosuxsoft
git pull
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
```

- El `build` reconstruye las imágenes (frontend Caddy + server Fastify) con el código nuevo.
- Al arrancar, el server corre `runMigrations()` automáticamente y aplica las migraciones
  de base de datos pendientes (crea tablas nuevas) **sin borrar datos existentes**.
- En el navegador, hacer **Ctrl+Shift+R** (hard refresh) para limpiar el bundle viejo cacheado.

### Si un cambio de frontend no aparece

Forzar reconstrucción sin caché:

```bash
cd /opt/dosuxsoft
git pull
docker compose -f deploy/docker-compose.yml build --no-cache
docker compose -f deploy/docker-compose.yml up -d --force-recreate
```

---

## Verificación post-despliegue

**Confirmar que llegó el commit correcto:**

```bash
cd /opt/dosuxsoft && git log --oneline -1
```

**Ver logs del server (migraciones + errores):**

```bash
docker compose -f deploy/docker-compose.yml logs server --tail=80
```

**Diagnóstico de base de datos (migraciones aplicadas + tablas existentes):**

```bash
docker compose -f deploy/docker-compose.yml exec server sh -c "cd /app/apps/server && node -e \"const D=require('better-sqlite3');const db=new D('/app/data/dosuxsoft.db',{readonly:true});const m=db.prepare('SELECT count(*) c,max(created_at) mx FROM __drizzle_migrations').get();console.log('migraciones:',m.c,'| maxCreatedAt:',m.mx);console.log('tablas:',db.prepare(\\\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\\\").all().map(r=>r.name).join(', '))\""
```

> **Nota:** el `cd /app/apps/server` es obligatorio — pnpm workspace instala `better-sqlite3` en
> `/app/apps/server/node_modules`, no en `/app/node_modules`. Sin el `cd`, `require` fallará.

---

## Notas importantes

- **Base de datos de producción:** `/app/data/dosuxsoft.db` (dentro del volumen `dosuxsoft-data`).
- **Backups:** `/app/data/backups/` — copia diaria interna, rotación 30 días.
- Las migraciones se definen en `apps/server/src/db/migrations/` y deben estar registradas
  en `meta/_journal.json`. Una migración `.sql` que no esté en el journal **NO se aplica**.
- El frontend se compila dentro de la imagen de Caddy en tiempo de build; cambios de UI
  requieren `build` (no solo `up`).
