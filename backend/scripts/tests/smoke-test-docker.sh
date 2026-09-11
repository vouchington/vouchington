#!/usr/bin/env bash
set -euo pipefail

# Docker-based smoke test for backend
# Builds the Docker image and verifies the server and worker start correctly.
# Uses --network host on Linux (CI). Docker Desktop for macOS does not support
# --network host; on macOS this falls back to bridge mode with port mapping.
# When using bridge mode, DATABASE_URL and VALKEY_URL must use host.docker.internal.

# Build from the repo root so the build context matches CI
# (`.github/workflows/build-backend.yml` uses `context: .` with
# `file: backend/Dockerfile`). The root `.dockerignore` is the
# authoritative ignore file for monorepo Docker builds.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../../.."

API_IMAGE_TAG="vouchit-backend-api-smoke:$$"
WORKER_IMAGE_TAG="vouchit-backend-worker-smoke:$$"
SERVER_CONTAINER="vouchit-backend-server-$$"
WORKER_CONTAINER="vouchit-backend-worker-$$"
# Keep local allocations outside every deterministic runner slice; on a numeric CI runner the
# allocator instead selects that runner's own slice.
SMOKE_PORT="${SMOKE_PORT:-$(python3 ci/allocate-browser-safe-ports.py 1)}"

cleanup() {
  docker stop "$SERVER_CONTAINER" 2>/dev/null || true
  docker rm "$SERVER_CONTAINER" 2>/dev/null || true
  docker stop "$WORKER_CONTAINER" 2>/dev/null || true
  docker rm "$WORKER_CONTAINER" 2>/dev/null || true
  docker rmi "$API_IMAGE_TAG" 2>/dev/null || true
  docker rmi "$WORKER_IMAGE_TAG" 2>/dev/null || true
}
trap cleanup EXIT

echo "Building backend Docker image (api target)..."
docker build -f backend/Dockerfile --target api -t "$API_IMAGE_TAG" .

echo "Building backend Docker image (worker-io target)..."
docker build -f backend/Dockerfile --target worker-io -t "$WORKER_IMAGE_TAG" .

# Network mode: --network host on Linux, bridge+port-map on macOS
if [ "$(uname)" = "Linux" ]; then
  SERVER_NETWORK=(--network host)
  WORKER_NETWORK=(--network host)
else
  SERVER_NETWORK=(-p "$SMOKE_PORT:$SMOKE_PORT")
  WORKER_NETWORK=(--network bridge)
fi

# Base env vars — only pass variables that are actually set to avoid
# overriding backend defaults with empty strings on local runs
BASE_ENV=(
  -e NODE_ENV="${NODE_ENV:-test}"
)
[ -n "${DATABASE_URL:-}" ] && BASE_ENV+=(-e DATABASE_URL="$DATABASE_URL")
[ -n "${VALKEY_URL:-}" ] && BASE_ENV+=(-e VALKEY_URL="$VALKEY_URL")

# --- Server smoke test ---

echo "Starting server container on port $SMOKE_PORT..."
docker run -d \
  --name "$SERVER_CONTAINER" \
  "${SERVER_NETWORK[@]}" \
  "${BASE_ENV[@]}" \
  -e PORT="$SMOKE_PORT" \
  "$API_IMAGE_TAG"

echo "Waiting for server to be ready (max 30s)..."
for i in {1..60}; do
  if curl -sf "http://localhost:${SMOKE_PORT}/infra/ping" >/dev/null 2>&1; then
    echo "✓ Server is ready"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "✗ Server did not become ready within 30s. Logs:"
    docker logs "$SERVER_CONTAINER"
    exit 1
  fi
  sleep 0.5
done

TMPFILE=$(mktemp)
HTTP_CODE=$(curl -s -o "$TMPFILE" -w "%{http_code}" "http://localhost:${SMOKE_PORT}/infra/ping")
BODY=$(cat "$TMPFILE")
rm -f "$TMPFILE"

if [ "$HTTP_CODE" != "200" ]; then
  echo "✗ /infra/ping returned HTTP $HTTP_CODE"
  docker logs "$SERVER_CONTAINER"
  exit 1
fi

if [ "$BODY" != "pong" ]; then
  echo "✗ /infra/ping returned '$BODY', expected 'pong'"
  exit 1
fi

echo "✓ /infra/ping returned 200 pong"
docker rm -f "$SERVER_CONTAINER" || true

# --- Worker smoke test ---
# Poll logs every 0.5s for up to 10s, checking for successful init or error patterns.

echo "Starting worker-io container..."
docker run -d \
  --name "$WORKER_CONTAINER" \
  "${WORKER_NETWORK[@]}" \
  "${BASE_ENV[@]}" \
  "$WORKER_IMAGE_TAG"

WORKER_READY=false
for i in {1..20}; do
  if ! docker inspect --format='{{.State.Running}}' "$WORKER_CONTAINER" 2>/dev/null | grep -q true; then
    echo "✗ Worker container stopped unexpectedly. Logs:"
    docker logs "$WORKER_CONTAINER"
    exit 1
  fi
  LOGS=$(docker logs "$WORKER_CONTAINER" 2>&1)
  if echo "$LOGS" | grep -qE "(^|[[:space:]])(Error:|Cannot find module|ENOENT|EACCES)"; then
    echo "✗ Worker failed during initialization. Logs:"
    echo "$LOGS"
    exit 1
  fi
  if echo "$LOGS" | grep -q "Workers: workers loaded."; then
    WORKER_READY=true
    break
  fi
  sleep 0.5
done

if [ "$WORKER_READY" = false ]; then
  echo "✗ Worker did not finish initializing within 10s. Logs:"
  docker logs "$WORKER_CONTAINER"
  exit 1
fi

echo "✓ Worker initialized successfully"
echo "✓ Docker smoke test passed"
