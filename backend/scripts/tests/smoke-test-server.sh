#!/usr/bin/env bash
set -euo pipefail

# Smoke test for server - starts the server, verifies it loads, then shuts it down gracefully

SERVER_OUTPUT_LOG="server-output.log"
PORT="${PORT:-3000}"

# How long a slow-but-healthy start may take. This is not a liveness check: a server
# that crashes or fails initialization is caught within milliseconds by the checks
# inside the loop, so this budget only bounds startup latency on a noisy CI runner.
# A healthy start logs readiness in roughly 5s, which left the previous 10s budget
# barely 2x of headroom and made the job flake.
STARTUP_TIMEOUT_SECONDS=30
POLL_INTERVAL_SECONDS=0.5
STARTUP_POLL_ATTEMPTS=$((STARTUP_TIMEOUT_SECONDS * 2))

# Start server in background
NODE_ENV=test PORT="$PORT" node entrypoints/api/serve.mts > "$SERVER_OUTPUT_LOG" 2>&1 &
SERVER_PID=$!

# Small delay to ensure log file is created and initial output is written
sleep 0.1

# Wait for server to load
for i in $(seq 1 "$STARTUP_POLL_ATTEMPTS"); do
  # Check if server process is still alive
  if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "✗ Error: Server process died unexpectedly. Output:"
    cat "$SERVER_OUTPUT_LOG"
    exit 1
  fi

  # Check for error patterns in output (fail fast on initialization errors)
  if grep -qE "(Error:|is required|Cannot find module|ENOENT|EACCES)" "$SERVER_OUTPUT_LOG" 2>/dev/null; then
    echo "✗ Error: Server failed during initialization. Output:"
    cat "$SERVER_OUTPUT_LOG"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
  fi

  # Check for success message
  if grep -q "API Server: serving at" "$SERVER_OUTPUT_LOG"; then
    echo "✓ Server loaded successfully"
    break
  fi

  # If we've reached the max iterations, fail
  if [ "$i" -eq "$STARTUP_POLL_ATTEMPTS" ]; then
    echo "✗ Error: Server did not log readiness within ${STARTUP_TIMEOUT_SECONDS} seconds."
    # The process is still alive and has logged no error — otherwise one of the checks
    # above would have fired — so say so explicitly. An empty log below is the finding,
    # not a missing diagnostic.
    echo "Process $SERVER_PID still running; $(wc -c < "$SERVER_OUTPUT_LOG" | tr -d ' ') bytes of output:"
    cat "$SERVER_OUTPUT_LOG"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
  fi
  sleep "$POLL_INTERVAL_SECONDS"
done

# Brief pause to ensure server is fully initialized
sleep 1

# Verify server is still running before testing
if ! kill -0 $SERVER_PID 2>/dev/null; then
  echo "✗ Error: Server process died unexpectedly. Output:"
  cat "$SERVER_OUTPUT_LOG"
  exit 1
fi

# Test the /infra/ping endpoint
echo "Testing /infra/ping endpoint..."
RESPONSE=$(curl -s -w "\n%{http_code}" "http://localhost:${PORT}/infra/ping")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "✗ Error: /infra/ping returned HTTP $HTTP_CODE, expected 200"
  echo "Response body: $BODY"
  kill $SERVER_PID 2>/dev/null || true
  exit 1
fi

if [ "$BODY" != "pong" ]; then
  echo "✗ Error: /infra/ping returned '$BODY', expected 'pong'"
  kill $SERVER_PID 2>/dev/null || true
  exit 1
fi

echo "✓ /infra/ping endpoint working correctly"

# Send SIGINT for graceful shutdown
kill -INT $SERVER_PID

# Wait for process to exit with timeout
SHUTDOWN_TIMEOUT=15
for i in $(seq 1 $SHUTDOWN_TIMEOUT); do
  if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "✓ Server started and shut down gracefully"
    exit 0
  fi
  sleep 1
done

echo "✗ Error: Server did not exit within $SHUTDOWN_TIMEOUT seconds (process still running after graceful shutdown)"
cat "$SERVER_OUTPUT_LOG"
kill -9 $SERVER_PID 2>/dev/null || true
exit 1
