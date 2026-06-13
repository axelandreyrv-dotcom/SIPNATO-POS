#!/bin/bash
# Dosuxsoft POS — Backup externo diario (host → directorio local)
# Complementa el backup interno del servidor (backup.ts).
# Cron: 0 10 * * * /opt/dosuxsoft/deploy/backup.sh
# (10:00 UTC = 04:00 AM Costa Rica — 1h después del backup interno)

set -euo pipefail

COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="/opt/dosuxsoft/backups"
DATE=$(date +%Y-%m-%d)
LOG="/var/log/dosuxsoft-backup.log"

mkdir -p "$BACKUP_DIR"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG"; }

log "Iniciando backup externo $DATE..."

# Copiar el dosuxsoft-latest.db del volumen Docker al host
# Usa un contenedor temporal con acceso de solo lectura al volumen
docker run --rm \
  --volumes-from "$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" ps -q server)" \
  -v "$BACKUP_DIR:/host-backup" \
  alpine:3 \
  cp /app/data/backups/dosuxsoft-latest.db "/host-backup/dosuxsoft-${DATE}.db"

# Rotar: conservar solo los últimos 30 backups en el host
ls -t "$BACKUP_DIR"/dosuxsoft-*.db 2>/dev/null | tail -n +31 | xargs -r rm --

log "Backup externo completado: $BACKUP_DIR/dosuxsoft-${DATE}.db"
