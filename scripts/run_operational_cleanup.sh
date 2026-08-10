#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OPS_IMAGE=${KF8FVD_OPS_IMAGE:-kf8fvd-ops:upgrade-2026-08-09}
APP_NETWORK=$(docker inspect --format '{{range $name, $config := .NetworkSettings.Networks}}{{$name}}{{end}}' kf8fvd)

if ! docker image inspect "$OPS_IMAGE" >/dev/null 2>&1; then
  printf 'Operations image is unavailable: %s\n' "$OPS_IMAGE" >&2
  exit 1
fi

docker run --rm \
  --network "$APP_NETWORK" \
  --env-file "$ROOT_DIR/.env" \
  -e DB_HOST=db \
  -e DB_PORT=3306 \
  "$OPS_IMAGE" scripts/cleanup_operational_data.js --apply
