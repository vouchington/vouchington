#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="$(cd "$WORKER_DIR/.." && pwd)"
WORKER_OUTPUT_LOG="${TMPDIR:-/tmp}/voucha-cloudflare-worker-smoke-$$.log"
WORKER_PID=''
MAX_PORT_BIND_ATTEMPTS=2

stop_worker() {
  if [ -z "$WORKER_PID" ]; then
    return
  fi
  if kill -0 "$WORKER_PID" 2>/dev/null; then
    kill -TERM "$WORKER_PID" 2>/dev/null || true
  fi
  wait "$WORKER_PID" 2>/dev/null || true
  WORKER_PID=''
}

has_port_bind_collision() {
  grep -qiE '(^|[^[:alnum:]_])EADDRINUSE([^[:alnum:]_]|$)|address already in use|port is already allocated' "$WORKER_OUTPUT_LOG"
}

# shellcheck disable=SC2329 # Invoked indirectly by the EXIT/INT/TERM trap below.
cleanup() {
  stop_worker
  rm -f "$WORKER_OUTPUT_LOG"
}
trap cleanup EXIT INT TERM

cd "$WORKER_DIR"
pnpm run build

for attempt in $(seq 1 "$MAX_PORT_BIND_ATTEMPTS"); do
  cd "$REPO_ROOT"
  read -r WORKER_PORT INSPECTOR_PORT <<< "$(python3 ci/allocate-browser-safe-ports.py 2)"
  if [ -n "${GITHUB_ENV:-}" ]; then
    echo "BROWSER_ALLOCATED_PORTS=$WORKER_PORT $INSPECTOR_PORT" >> "$GITHUB_ENV"
  fi
  cd "$WORKER_DIR"
  : > "$WORKER_OUTPUT_LOG"
  CI=true RUNNER_TEMP="${TMPDIR:-/tmp}" WRANGLER_LOCAL_PROTOCOL=http \
    WORKER_PORT="$WORKER_PORT" INSPECTOR_PORT="$INSPECTOR_PORT" \
    node scripts/wrangler/start.mts </dev/null > "$WORKER_OUTPUT_LOG" 2>&1 &
  WORKER_PID=$!

  ROBOTS_STATUS=000
  launch_failed=false
  for _ in {1..40}; do
    if ! kill -0 "$WORKER_PID" 2>/dev/null; then
      launch_failed=true
      break
    fi
    if grep -qE '(Error:|Cannot find module|ENOENT|EACCES)' "$WORKER_OUTPUT_LOG" 2>/dev/null; then
      launch_failed=true
      break
    fi

    ROBOTS_STATUS=$(curl --connect-timeout 1 --max-time 2 -s -o /dev/null -w '%{http_code}' \
      "http://127.0.0.1:${WORKER_PORT}/robots.txt" 2>/dev/null || true)
    if [ "$ROBOTS_STATUS" = 200 ]; then
      echo "Cloudflare Worker smoke test passed on port $WORKER_PORT"
      exit 0
    fi
    sleep 0.5
  done

  if $launch_failed; then
    stop_worker
    if [ "$attempt" -lt "$MAX_PORT_BIND_ATTEMPTS" ] && has_port_bind_collision; then
      echo "Cloudflare Worker port bind collision before readiness; reallocating once"
      continue
    fi
    echo "Error: Cloudflare Worker failed during initialization. Output:"
    cat "$WORKER_OUTPUT_LOG"
    exit 1
  fi

  echo "Error: GET /robots.txt returned HTTP ${ROBOTS_STATUS:-000} (expected 200). Output:"
  cat "$WORKER_OUTPUT_LOG"
  exit 1
done
