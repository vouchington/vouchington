#!/usr/bin/env bash
set -euo pipefail

# Smoke test for worker - starts the worker, verifies it loads, then shuts it down gracefully

WORKER_OUTPUT_LOG="worker-output.log"

# Start worker in background
NODE_ENV='test' node entrypoints/worker-io/serve.mts > "$WORKER_OUTPUT_LOG" 2>&1 &
WORKER_PID=$!

# Small delay to ensure log file is created and initial output is written
sleep 0.1

# Wait for worker to load (max 10 seconds)
for i in {1..20}; do
  # Check if worker process is still alive
  if ! kill -0 $WORKER_PID 2>/dev/null; then
    echo "✗ Error: Worker process died unexpectedly. Output:"
    cat "$WORKER_OUTPUT_LOG"
    exit 1
  fi
  
  # Check for success message first — non-fatal warnings may follow
  if grep -q "Workers: workers loaded." "$WORKER_OUTPUT_LOG"; then
    echo "✓ Worker loaded successfully"
    break
  fi

  # Check for fatal error patterns (exclude WARN-level lines from glide-mq/Valkey)
  if grep -v ' WARN ' "$WORKER_OUTPUT_LOG" 2>/dev/null | grep -qE "(Error:|is required|Cannot find module|ENOENT|EACCES)"; then
    echo "✗ Error: Worker failed during initialization. Output:"
    cat "$WORKER_OUTPUT_LOG"
    kill $WORKER_PID 2>/dev/null || true
    exit 1
  fi
  
  # If we've reached the max iterations, fail
  if [ "$i" -eq 20 ]; then
    echo "✗ Error: Worker did not load within 10 seconds. Output:"
    cat "$WORKER_OUTPUT_LOG"
    kill $WORKER_PID 2>/dev/null || true
    exit 1
  fi
  sleep 0.5
done

# Brief pause to ensure worker is fully initialized
sleep 1

# Verify worker is still running before killing
if ! kill -0 $WORKER_PID 2>/dev/null; then
  echo "✗ Error: Worker process died unexpectedly. Output:"
  cat "$WORKER_OUTPUT_LOG"
  exit 1
fi

# Enqueue a migration job and verify it completes (migrations already ran, so it's a no-op).
# Resolve @queues/psql from the worker-io entrypoint's dependency closure — the backend hub
# no longer declares every workspace package.
(cd entrypoints/worker-io && node -e "import('@queues/psql/enqueues').then(m => m.enqueueRunMigrations())") &
ENQUEUE_PID=$!

JOB_TIMEOUT=15
for i in $(seq 1 $JOB_TIMEOUT); do
  if grep -q "job completed: runMigrations" "$WORKER_OUTPUT_LOG"; then
    echo "✓ Migration job completed successfully"
    break
  fi
  if [ "$i" -eq "$JOB_TIMEOUT" ]; then
    echo "✗ Error: Migration job did not complete within $JOB_TIMEOUT seconds. Output:"
    cat "$WORKER_OUTPUT_LOG"
    kill $WORKER_PID 2>/dev/null || true
    kill $ENQUEUE_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
done
kill $ENQUEUE_PID 2>/dev/null || true

# Send SIGINT for graceful shutdown
kill -INT $WORKER_PID

# Wait for process to exit with timeout
SHUTDOWN_TIMEOUT=15
for i in $(seq 1 $SHUTDOWN_TIMEOUT); do
  if ! kill -0 $WORKER_PID 2>/dev/null; then
    echo "✓ Worker started and shut down gracefully"
    exit 0
  fi
  sleep 1
done

echo "✗ Error: Worker did not exit within $SHUTDOWN_TIMEOUT seconds (process still running after graceful shutdown)"
cat "$WORKER_OUTPUT_LOG"

echo ""
echo "=== Leak Detection: open file descriptors for PID $WORKER_PID ==="
echo "(Unix sockets staying open after close() indicate fd/handle leaks)"
lsof -p "$WORKER_PID" 2>/dev/null || echo "(lsof unavailable)"

kill -9 $WORKER_PID 2>/dev/null || true
exit 1
