#!/bin/sh
set -eu

CONFIG_FILE=${KF8FVD_BACKUP_CONFIG:-$HOME/.config/kf8fvd/backup.env}
if [ -f "$CONFIG_FILE" ]; then
  set -a
  . "$CONFIG_FILE"
  set +a
fi

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TIMESTAMP=$(date -u +%Y-%m-%d_%H-%M-%S)
BACKUP_DIR="$ROOT_DIR/data/backups/production_$TIMESTAMP"
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
ROLLING_DIR=${BACKUP_ROLLING_DIR:-}
KEEP_LATEST_ONLY=${BACKUP_KEEP_LATEST_ONLY:-0}

mkdir -p "$BACKUP_DIR/mysql" "$BACKUP_DIR/umami-postgres"

cleanup_failed_snapshot() {
  status=$?
  if [ "$status" -ne 0 ]; then
    printf 'Backup failed; incomplete snapshot remains at %s\n' "$BACKUP_DIR" >&2
  fi
  exit "$status"
}
trap cleanup_failed_snapshot EXIT

printf 'Creating MinIO mirror...\n'
OPS_IMAGE=${KF8FVD_OPS_IMAGE:-kf8fvd-ops:upgrade-2026-08-09}
if ! docker image inspect "$OPS_IMAGE" >/dev/null 2>&1; then
  printf 'Operations image is unavailable: %s\n' "$OPS_IMAGE" >&2
  exit 1
fi
APP_NETWORK=$(docker inspect --format '{{range $name, $config := .NetworkSettings.Networks}}{{$name}}{{end}}' kf8fvd)
docker run --rm \
  --network "$APP_NETWORK" \
  --user "$(id -u):$(id -g)" \
  --env-file "$ROOT_DIR/.env" \
  -e NODE_ENV=production \
  -e NODE_PATH=/app/node_modules \
  -e DB_HOST=db \
  -e DB_PORT=3306 \
  -e MINIO_HOST=minio \
  -e MINIO_PORT=9000 \
  -e MINIO_USE_SSL=0 \
  --entrypoint node \
  -w /workspace \
  -v "$ROOT_DIR/scripts:/workspace/scripts:ro" \
  -v "$ROOT_DIR/data:/workspace/data" \
  "$OPS_IMAGE" scripts/backup_restore_drill.js --snapshot-only --skip-db --out-dir="data/backups/production_$TIMESTAMP"

printf 'Creating MySQL snapshot...\n'
docker exec kf8fvd-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --skip-lock-tables --no-tablespaces --routines --triggers --events "$MYSQL_DATABASE"' > "$BACKUP_DIR/mysql/kf8fvd.sql"

printf 'Creating Umami PostgreSQL snapshot...\n'
docker exec kf8fvd-umami-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$BACKUP_DIR/umami-postgres/umami.dump"
docker exec -i kf8fvd-umami-db pg_restore --list < "$BACKUP_DIR/umami-postgres/umami.dump" > /dev/null

printf '%s\n' "$TIMESTAMP" > "$BACKUP_DIR/BACKUP_TIMESTAMP"
(cd "$BACKUP_DIR" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)

sync_rolling_copy() {
  destination=$1
  label=$2
  mkdir -p "$destination"
  if [ ! -w "$destination" ]; then
    printf '%s destination is not writable: %s\n' "$label" "$destination" >&2
    exit 1
  fi
  printf 'Updating %s rolling mirror...\n' "$label"
  rsync -a --checksum --delete-delay --delay-updates --stats "$BACKUP_DIR/" "$destination/"
  (cd "$destination" && sha256sum -c SHA256SUMS >/dev/null)
  chmod -R go-rwx "$destination"
}

if [ -n "$ROLLING_DIR" ]; then
  sync_rolling_copy "$ROLLING_DIR" 'local'
fi

if [ -n "${BACKUP_REMOTE_DIR:-}" ]; then
  if [ ! -d "$BACKUP_REMOTE_DIR" ]; then
    printf 'Configured BACKUP_REMOTE_DIR does not exist: %s\n' "$BACKUP_REMOTE_DIR" >&2
    exit 1
  fi
  sync_rolling_copy "$BACKUP_REMOTE_DIR/current" 'off-host'
elif [ "${REQUIRE_OFFSITE_BACKUP:-0}" = "1" ]; then
  printf 'REQUIRE_OFFSITE_BACKUP=1 but BACKUP_REMOTE_DIR is not configured\n' >&2
  exit 1
fi

if [ "$KEEP_LATEST_ONLY" = "1" ] && { [ -n "$ROLLING_DIR" ] || [ -n "${BACKUP_REMOTE_DIR:-}" ]; }; then
  find "$ROOT_DIR/data/backups" -mindepth 1 -maxdepth 1 -type d \( -name 'production_*' -o -name 'upgrade_*' \) -exec rm -rf -- {} +
else
  find "$ROOT_DIR/data/backups" -mindepth 1 -maxdepth 1 -type d -name 'production_*' -mtime "+$RETENTION_DAYS" -exec rm -rf -- {} +
fi

trap - EXIT
if [ -d "$BACKUP_DIR" ]; then
  printf 'Backup completed: %s\n' "$BACKUP_DIR"
else
  printf 'Backup completed and rolling mirror verified.\n'
fi
