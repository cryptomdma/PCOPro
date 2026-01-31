#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
DB_CONTAINER="${POSTGRES_CONTAINER:-pestledger-db}"
POSTGRES_USER="${POSTGRES_USER:-pco}"
POSTGRES_DB="${POSTGRES_DB:-pco}"

mkdir -p "$BACKUP_DIR"

echo "Creating backup for ${POSTGRES_DB} from container ${DB_CONTAINER}..."
docker exec -t "$DB_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "${BACKUP_DIR}/pestledger_${TIMESTAMP}.sql"

if [[ -n "${RETENTION_DAYS:-}" ]]; then
  find "$BACKUP_DIR" -type f -name "pestledger_*.sql" -mtime +"${RETENTION_DAYS}" -delete
fi

echo "Backup written to ${BACKUP_DIR}/pestledger_${TIMESTAMP}.sql"
