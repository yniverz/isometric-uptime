#!/bin/sh
set -e
# Make sure the data directory is writable (bind mounts are often root-owned),
# then drop privileges.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
  exec su-exec node "$@"
fi
exec "$@"
