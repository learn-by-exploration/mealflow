#!/usr/bin/env bash
# MealFlow backup script — rotates last N backups
set -euo pipefail

DB_DIR="${DB_DIR:-./data}"
BACKUP_DIR="./backups"
RETAIN="${BACKUP_RETAIN_COUNT:-7}"
DB_FILE="$DB_DIR/mealflow.db"

if [ ! -f "$DB_FILE" ]; then
  echo "No database found at $DB_FILE — skipping backup"
  exit 0
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/mealflow-backup-$TIMESTAMP.db"

# Use SQLite backup API via Node
node -e "
  const Database = require('better-sqlite3');
  const db = new Database('$DB_FILE', { readonly: true });
  db.backup('$BACKUP_FILE').then(() => { db.close(); console.log('Backup: $BACKUP_FILE'); });
" 2>/dev/null || cp "$DB_FILE" "$BACKUP_FILE"

echo "Backup created: $BACKUP_FILE"

# Rotate old backups
cd "$BACKUP_DIR"
ls -1t mealflow-backup-*.db 2>/dev/null | tail -n +$((RETAIN + 1)) | xargs -r rm -f
echo "Rotated to keep last $RETAIN backups"
