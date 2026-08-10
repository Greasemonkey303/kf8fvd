#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  printf 'Usage: %s /mounted/offsite/path\n' "$0" >&2
  exit 2
fi

DESTINATION=$(readlink -f "$1")
if [ ! -d "$DESTINATION" ]; then
  printf 'Backup destination does not exist: %s\n' "$DESTINATION" >&2
  exit 1
fi
if [ ! -w "$DESTINATION" ]; then
  printf 'Backup destination is not writable: %s\n' "$DESTINATION" >&2
  exit 1
fi

FSTYPE=$(findmnt -rn -T "$DESTINATION" -o FSTYPE)
SOURCE=$(findmnt -rn -T "$DESTINATION" -o SOURCE)
case "$FSTYPE" in
  nfs|nfs4|cifs|smb3|fuse.sshfs|sshfs|fuse.rclone) ;;
  *)
    printf 'Destination must be a network/off-host mount; got %s from %s\n' "$FSTYPE" "$SOURCE" >&2
    exit 1
    ;;
esac

CONFIG_DIR="$HOME/.config/kf8fvd"
CONFIG_FILE="$CONFIG_DIR/backup.env"
mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"
cat > "$CONFIG_FILE" <<EOF
BACKUP_REMOTE_DIR=$DESTINATION
REQUIRE_OFFSITE_BACKUP=1
BACKUP_ROLLING_DIR=/opt/kf8fvd/data/rolling-backup/current
BACKUP_KEEP_LATEST_ONLY=1
BACKUP_RETENTION_DAYS=14
KF8FVD_OPS_IMAGE=kf8fvd-ops:upgrade-2026-08-09
EOF
chmod 600 "$CONFIG_FILE"

BACKUP_REMOTE_DIR="$DESTINATION" REQUIRE_OFFSITE_BACKUP=1 /opt/kf8fvd/scripts/create_production_snapshot.sh
LATEST="$DESTINATION/current"
if [ ! -f "$LATEST/SHA256SUMS" ]; then
  printf 'Off-host replication could not be verified\n' >&2
  exit 1
fi
(cd "$LATEST" && sha256sum -c SHA256SUMS >/dev/null)

printf 'Off-host backup configured and verified: %s\n' "$LATEST"
