#!/usr/bin/env bash
set -euo pipefail

# Smoke test for web - assumes build exists, starts in production mode, verifies it loads, then shuts down gracefully

# Determine script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="$(cd "$WEB_DIR/.." && pwd)"
WEB_OUTPUT_LOG="$WEB_DIR/web-output.log"

# Reserve the web and localization backend ports together from the browser-safe pool. A raw random
# port can be one that Fetch rejects with "bad port": curl still connects to it, so the backend
# health check passes, but Next.js' server-side fetch throws before it opens a connection.
# Resolve the allocator from the repo root so the script works from any working directory.
echo "Selecting web smoke ports..."
PORTS=$(python3 "$REPO_ROOT/ci/allocate-browser-safe-ports.py" 2) || {
  echo "✗ Error: Could not allocate browser-safe ports"
  exit 1
}
read -r WEB_PORT BACKEND_PORT <<< "$PORTS"
if [ -z "${WEB_PORT:-}" ] || [ -z "${BACKEND_PORT:-}" ] || [ "$WEB_PORT" = "$BACKEND_PORT" ]; then
  echo "✗ Error: Expected two distinct browser-safe ports, got: '$PORTS'"
  exit 1
fi

# Check if build exists
if [ ! -d "$WEB_DIR/.next" ]; then
  echo "✗ Error: Next.js build not found. Run 'pnpm --dir web build' first."
  exit 1
fi

SMOKE_TMP_DIR=$(mktemp -d)
cleanup() {
  if [ -n "${WEB_PID:-}" ]; then kill "$WEB_PID" 2>/dev/null || true; fi
  if [ -n "${BACKEND_PID:-}" ]; then kill "$BACKEND_PID" 2>/dev/null || true; fi
  if [ -n "${BACKEND_PID:-}" ]; then wait "$BACKEND_PID" 2>/dev/null || true; fi
  rm -rf "$SMOKE_TMP_DIR"
}
trap cleanup EXIT

# The live web server always requests copy over HTTP. Serve that request through the real
# backend localization resolver and a freshly compiled catalog during this standalone smoke.
echo "Preparing localization smoke backend..."
cd "$REPO_ROOT"
echo "Compiling localization catalog for smoke test..."
node web/test-helpers/compile-localization-smoke-catalog.mts "$SMOKE_TMP_DIR/catalog.sqlite"
LOCALIZATION_SQLITE_PATH="$SMOKE_TMP_DIR/catalog.sqlite" \
  node web/test-helpers/localization-smoke-backend.mts "$BACKEND_PORT" > "$SMOKE_TMP_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
for i in {1..30}; do
  if curl --max-time 5 -fsS "http://127.0.0.1:$BACKEND_PORT/health" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    cat "$SMOKE_TMP_DIR/backend.log"
    exit 1
  fi
  sleep 0.2
done
if ! curl --max-time 5 -fsS "http://127.0.0.1:$BACKEND_PORT/health" >/dev/null; then
  cat "$SMOKE_TMP_DIR/backend.log"
  exit 1
fi

echo "✓ Next.js build found, starting production server on port $WEB_PORT..."

# Copy standalone assets before starting (package start commands do this, but we start node directly
# so that SIGTERM reaches the Node.js process rather than a package manager process)
cd "$WEB_DIR"
bash scripts/copy-standalone-assets.sh

# Start node directly (matches Dockerfile production pattern) so signals propagate correctly
ALLOW_TURNSTILE_TEST_KEY="${ALLOW_TURNSTILE_TEST_KEY:-true}" \
  API_BASE_URL="http://127.0.0.1:$BACKEND_PORT" \
  IMAGE_ORIGIN="${IMAGE_ORIGIN:-http://localhost:$WEB_PORT}" \
  NODE_ENV=production \
  PORT=$WEB_PORT \
  node "$WEB_DIR/.next/standalone/web/server.js" > "$WEB_OUTPUT_LOG" 2>&1 &
WEB_PID=$!

echo "Started Next.js with PID: $WEB_PID"

# Small delay to ensure log file is created and initial output is written
sleep 0.5

# Wait for server to load (max 30 seconds for Next.js)
for i in {1..60}; do
  # Check if server process is still alive
  if ! kill -0 $WEB_PID 2>/dev/null; then
    echo "✗ Error: Web server process died unexpectedly. Output:"
    cat "$WEB_OUTPUT_LOG"
    exit 1
  fi

  # Check for error patterns in output (fail fast on initialization errors)
  if grep -qE "(Error:|Cannot find module|ENOENT|EACCES)" "$WEB_OUTPUT_LOG" 2>/dev/null; then
    echo "✗ Error: Web server failed during initialization. Output:"
    cat "$WEB_OUTPUT_LOG"
    kill $WEB_PID 2>/dev/null || true
    exit 1
  fi

  # Check for success message - Next.js shows "Local:" or "ready" (case insensitive)
  if grep -qiE "(Local:|ready started|▲ Next.js)" "$WEB_OUTPUT_LOG" 2>/dev/null; then
    echo "✓ Web server loaded successfully"
    break
  fi

  # If we've reached the max iterations, fail with debug output
  if [ "$i" -eq 60 ]; then
    echo "✗ Error: Web server did not load within 30 seconds."
    echo "Server output:"
    cat "$WEB_OUTPUT_LOG"
    kill $WEB_PID 2>/dev/null || true
    exit 1
  fi
  sleep 0.5
done

# Brief pause to ensure server is fully initialized
sleep 1

# Verify server is still running before testing
if ! kill -0 $WEB_PID 2>/dev/null; then
  echo "✗ Error: Web server process died unexpectedly. Output:"
  cat "$WEB_OUTPUT_LOG"
  exit 1
fi

# Test the homepage
echo "Testing homepage on http://localhost:$WEB_PORT..."
TMPFILE=$(mktemp)
HTTP_CODE=$(curl --max-time 30 -s -o "$TMPFILE" -w "%{http_code}" "http://localhost:$WEB_PORT/")

if [ "$HTTP_CODE" != "200" ]; then
  echo "✗ Error: Homepage returned HTTP $HTTP_CODE, expected 200"
  echo "Response body:"
  cat "$TMPFILE"
  rm -f "$TMPFILE"
  echo "Server log:"
  cat "$WEB_OUTPUT_LOG" || true
  kill $WEB_PID 2>/dev/null || true
  exit 1
fi

# Verify response contains Next.js content (_next/ is present in all Next.js pages)
if ! grep -q "_next/" "$TMPFILE"; then
  echo "✗ Error: Homepage response doesn't appear to be a Next.js page"
  echo "Response body:"
  cat "$TMPFILE"
  rm -f "$TMPFILE"
  kill $WEB_PID 2>/dev/null || true
  exit 1
fi
rm -f "$TMPFILE"

echo "✓ Homepage working correctly"

# Send SIGTERM for graceful shutdown (Next.js standalone server handles SIGTERM)
echo "Shutting down server..."
kill -TERM $WEB_PID 2>/dev/null || true

# Wait for process to exit (max 5 seconds)
for i in {1..10}; do
  if ! kill -0 $WEB_PID 2>/dev/null; then
    echo "✓ Web server started and shut down gracefully"
    exit 0
  fi
  sleep 0.5
done

# If still running, force kill
echo "⚠ Server didn't shut down gracefully, forcing shutdown..."
kill -9 $WEB_PID 2>/dev/null || true
echo "✓ Web server started and shut down (forced)"
