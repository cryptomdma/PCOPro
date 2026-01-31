#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: ./scripts/restore.sh path/to/backup.sql"
  exit 1
fi

BACKUP_FILE="$1"
DB_CONTAINER="${POSTGRES_CONTAINER:-pestledger-db}"
POSTGRES_USER="${POSTGRES_USER:-pco}"
POSTGRES_DB="${POSTGRES_DB:-pco}"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "Restoring ${POSTGRES_DB} from ${BACKUP_FILE} into container ${DB_CONTAINER}..."
cat "$BACKUP_FILE" | docker exec -i "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
echo "Restore complete."
