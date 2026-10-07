#!/bin/bash
# Dosuxsoft POS — Backup externo diario (host → directorio local)
# Complementa el backup interno del servidor (backup.ts).
# Cron: 0 10 * * * /opt/dosuxsoft/deploy/backup.sh
# (10:00 UTC = 04:00 AM Costa Rica — 1h después del backup interno)
#
# Copia backups/<slug>/latest.db de CADA negocio a /opt/dosuxsoft/backups/<slug>/YYYY-MM-DD.db

set -euo pipefail

COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="/opt/dosuxsoft/backups"
DATE=$(date +%Y-%m-%d)
LOG="/var/log/dosuxsoft-backup.log"

mkdir -p "$BACKUP_DIR"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG"; }

log "Iniciando backup externo $DATE..."

# Contenedor temporal con acceso al volumen de datos: copia el latest.db de cada negocio.
docker run --rm \
  --volumes-from "$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" ps -q server)" \
  -v "$BACKUP_DIR:/host-backup" \
  -e DATE="$DATE" \
  alpine:3 \
  sh -c 'for f in /app/data/backups/*/latest.db; do
           [ -e "$f" ] || continue
           slug=$(basename "$(dirname "$f")")
           mkdir -p "/host-backup/$slug"
           cp "$f" "/host-backup/$slug/$DATE.db"
         done'

# Rotar: conservar solo los últimos 30 backups por negocio en el host
for dir in "$BACKUP_DIR"/*/; do
  [ -d "$dir" ] || continue
  ls -t "$dir"*.db 2>/dev/null | tail -n +31 | xargs -r rm --
done

log "Backup externo completado en $BACKUP_DIR/<negocio>/${DATE}.db"
