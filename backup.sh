#!/usr/bin/env bash
#
# Threadly store — backup of the store data (db.json + webhook event log).
#
# Usage:  ./backup.sh [DATA_DIR] [BACKUP_DIR] [KEEP]
#   DATA_DIR   Host folder holding db.json (default: ./data)
#   BACKUP_DIR Where timestamped backups go (default: ./backups)
#   KEEP       How many backups to retain (default: 30)
#
# Backups are gzip-compressed and timestamped, e.g.:
#   backups/db-2026-08-17T030000Z.json.gz
#
# Safe to run while the store is live: the server writes db.json atomically
# (temp file + rename), so a backup is always a full, consistent snapshot.

set -euo pipefail

DATA_DIR="${1:-./data}"
BACKUP_DIR="${2:-./backups}"
KEEP="${3:-30}"

if [[ ! -d "$DATA_DIR" ]]; then
  echo "error: data directory not found: $DATA_DIR" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"

# Core store data: products, orders, customers, settings.
if [[ -f "$DATA_DIR/db.json" ]]; then
  gzip -c "$DATA_DIR/db.json" > "$BACKUP_DIR/db-$STAMP.json.gz"
  echo "backed up db.json -> $BACKUP_DIR/db-$STAMP.json.gz"
else
  echo "warning: no db.json in $DATA_DIR — nothing to back up" >&2
fi

# Optional order-webhook event log lives next to the database.
if [[ -f "$DATA_DIR/webhook-events.jsonl" ]]; then
  gzip -c "$DATA_DIR/webhook-events.jsonl" > "$BACKUP_DIR/webhook-events-$STAMP.jsonl.gz"
fi

# Prune old backups, keeping the newest $KEEP of each kind.
ls -1t "$BACKUP_DIR"/db-*.json.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f || true
ls -1t "$BACKUP_DIR"/webhook-events-*.jsonl.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f || true

echo "backup complete: $(ls -1 "$BACKUP_DIR" | wc -l) file(s) in $BACKUP_DIR"
