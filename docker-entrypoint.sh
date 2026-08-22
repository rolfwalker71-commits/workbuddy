#!/bin/sh
set -e

DATA_DIR="${DATABASE_PATH:-/app/data/supportdesk.sqlite}"
DATA_DIR="$(dirname "$DATA_DIR")"
mkdir -p "$DATA_DIR"

ensure_writable() {
  if touch "$DATA_DIR/.workbuddy-write-test" 2>/dev/null; then
    rm -f "$DATA_DIR/.workbuddy-write-test"
    return 0
  fi
  return 1
}

if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
  chmod u+rwX "$DATA_DIR" 2>/dev/null || true

  if command -v runuser >/dev/null 2>&1; then
    if ! runuser -u node -- sh -c "touch '$DATA_DIR/.workbuddy-write-test' && rm -f '$DATA_DIR/.workbuddy-write-test'"; then
      echo "workbuddy: '$DATA_DIR' is not writable by user 'node' (uid 1000)." >&2
      echo "workbuddy: On the host: sudo chown -R 1000:1000 ./data && docker compose restart" >&2
      exit 1
    fi
    exec runuser -u node -- env HOME=/home/node npm run start
  fi

  if ! su -s /bin/sh node -c "touch '$DATA_DIR/.workbuddy-write-test' && rm -f '$DATA_DIR/.workbuddy-write-test'"; then
    echo "workbuddy: '$DATA_DIR' is not writable by user 'node' (uid 1000)." >&2
    echo "workbuddy: On the host: sudo chown -R 1000:1000 ./data && docker compose restart" >&2
    exit 1
  fi
  exec su -s /bin/sh node -c 'cd /app && exec npm run start'
fi

if ! ensure_writable; then
  echo "workbuddy: '$DATA_DIR' is not writable by uid $(id -u)." >&2
  echo "  sudo chown -R 1000:1000 ./data && docker compose restart" >&2
  exit 1
fi

exec npm run start
