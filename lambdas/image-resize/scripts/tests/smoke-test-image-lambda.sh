#!/usr/bin/env bash
set -euo pipefail

# Smoke test for image lambda dev server - allocates a port, starts the server, verifies it
# answers /health over HTTP, then shuts it down gracefully.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAMBDA_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LAMBDAS_DIR="$(cd "$LAMBDA_DIR/.." && pwd)"
REPO_ROOT="$(cd "$LAMBDAS_DIR/.." && pwd)"
LAMBDA_OUTPUT_LOG="${TMPDIR:-/tmp}/voucha-image-lambda-smoke-$$.log"
LAMBDA_PID=''
MAX_PORT_BIND_ATTEMPTS=2
# Captured once, before any per-attempt override below, so a reallocation retry never
# compounds this path onto itself.
BASE_DIAGNOSTICS_DIR="${BROWSER_PORT_DIAGNOSTICS_DIR:-}"

stop_lambda() {
  if [ -z "$LAMBDA_PID" ]; then
    return
  fi
  if kill -0 "$LAMBDA_PID" 2>/dev/null; then
    kill -TERM "$LAMBDA_PID" 2>/dev/null || true
  fi
  wait "$LAMBDA_PID" 2>/dev/null || true
  LAMBDA_PID=''
}

has_port_bind_collision() {
  grep -qiE '(^|[^[:alnum:]_])EADDRINUSE([^[:alnum:]_]|$)|address already in use|port is already allocated' "$LAMBDA_OUTPUT_LOG"
}

# shellcheck disable=SC2329 # Invoked indirectly by the EXIT/INT/TERM trap below.
cleanup() {
  stop_lambda
  rm -f "$LAMBDA_OUTPUT_LOG"
}
trap cleanup EXIT INT TERM

for attempt in $(seq 1 "$MAX_PORT_BIND_ATTEMPTS"); do
  cd "$REPO_ROOT"
  IMAGE_LAMBDA_PORT="$(python3 ci/allocate-browser-safe-ports.py 1)"

  : > "$LAMBDA_OUTPUT_LOG"

  env_args=(
    "IMAGE_LAMBDA_PORT=$IMAGE_LAMBDA_PORT"
    "S3_BUCKET_IMAGES=test-images"
    "S3_BUCKET_RENDERS=test-renders"
  )
  if [ -n "$BASE_DIAGNOSTICS_DIR" ]; then
    # Nest per script-attempt so a reallocation retry never overwrites the previous
    # attempt's bind-time evidence written under the same base directory.
    env_args+=("BROWSER_PORT_DIAGNOSTICS_DIR=$BASE_DIAGNOSTICS_DIR/smoke-attempt-$attempt")
  fi

  env "${env_args[@]}" node "$LAMBDAS_DIR/dev-server.mts" </dev/null > "$LAMBDA_OUTPUT_LOG" 2>&1 &
  LAMBDA_PID=$!

  HEALTH_STATUS=000
  launch_failed=false
  for _ in {1..40}; do
    if ! kill -0 "$LAMBDA_PID" 2>/dev/null; then
      launch_failed=true
      break
    fi

    if grep -qE '(Error:|Cannot find module|ENOENT|EACCES)' "$LAMBDA_OUTPUT_LOG" 2>/dev/null; then
      launch_failed=true
      break
    fi

    HEALTH_STATUS=$(curl --connect-timeout 1 --max-time 2 -s -o /dev/null -w '%{http_code}' \
      "http://127.0.0.1:${IMAGE_LAMBDA_PORT}/health" 2>/dev/null || true)
    if [ "$HEALTH_STATUS" = 200 ]; then
      echo "✓ Lambda dev server loaded successfully on port $IMAGE_LAMBDA_PORT"
      break 2
    fi

    sleep 0.5
  done

  if $launch_failed; then
    stop_lambda
    if [ "$attempt" -lt "$MAX_PORT_BIND_ATTEMPTS" ] && has_port_bind_collision; then
      echo "Image lambda port bind collision before readiness; reallocating once"
      continue
    fi
    echo "✗ Error: Lambda dev server failed during initialization. Output:"
    cat "$LAMBDA_OUTPUT_LOG"
    exit 1
  fi

  echo "✗ Error: GET /health returned HTTP ${HEALTH_STATUS:-000} (expected 200) within 20 seconds. Output:"
  cat "$LAMBDA_OUTPUT_LOG"
  stop_lambda
  exit 1
done

if ! kill -0 "$LAMBDA_PID" 2>/dev/null; then
  echo "✗ Error: Lambda dev server process died unexpectedly. Output:"
  cat "$LAMBDA_OUTPUT_LOG"
  exit 1
fi

kill -INT "$LAMBDA_PID" 2>/dev/null || true
wait "$LAMBDA_PID" || true
LAMBDA_PID=''

echo "✓ Lambda dev server started and shut down gracefully"
