#!/bin/sh
set -e

# Load Docker secrets from /run/secrets into environment variables.
# For each file in /run/secrets, the filename will be uppercased and
# non-alphanumerics replaced with underscores to form the env var name.
if [ -d /run/secrets ]; then
  for f in /run/secrets/*; do
    [ -f "$f" ] || continue
    name=$(basename "$f")
    # uppercase and replace - with _ ; then sanitize to [A-Z0-9_]
    envname=$(echo "$name" | tr '[:lower:]-' '[:upper:]_' | sed 's/[^A-Z0-9_]/_/g')
    # read secret contents (strip trailing newline)
    val=$(cat "$f" )
    # export into environment
    export "$envname"="$val"
  done
fi

# Optional debug: if DEBUG_DOCKER_SECRETS=1, print which vars were loaded (but not values)
if [ "${DEBUG_DOCKER_SECRETS:-0}" = "1" ]; then
  echo "Loaded secrets into env:"
  for f in /run/secrets/*; do
    [ -f "$f" ] || continue
    name=$(basename "$f")
    envname=$(echo "$name" | tr '[:lower:]-' '[:upper:]_' | sed 's/[^A-Z0-9_]/_/g')
    echo "- $envname"
  done
fi

# exec the container CMD
exec "$@"
