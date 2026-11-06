#!/usr/bin/env bash
set -euo pipefail
IMAGE="$IMAGE_REPOSITORY/web:$IMAGE_TAG"
PORTS=$(python3 node_modules/vouchington-tooling/scripts/allocate-browser-safe-ports.py 2)
read -r PORT BACKEND_PORT <<< "$PORTS"
SMOKE_TMP_DIR=$(mktemp -d "${RUNNER_TEMP}/web-image-smoke.XXXXXX")
cleanup() {
  if [ -n "${CONTAINER:-}" ]; then
    docker stop "$CONTAINER" >/dev/null 2>&1 || true
    docker rm "$CONTAINER" >/dev/null 2>&1 || true
  fi
  if [ -n "${BACKEND_PID:-}" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
  rm -rf "$SMOKE_TMP_DIR"
}
trap cleanup EXIT
node web/test-helpers/compile-localization-smoke-catalog.mts "$SMOKE_TMP_DIR/catalog.sqlite"
LOCALIZATION_SQLITE_PATH="$SMOKE_TMP_DIR/catalog.sqlite" \
  node web/test-helpers/localization-smoke-backend.mts "$BACKEND_PORT" 0.0.0.0 > "$SMOKE_TMP_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
for i in $(seq 1 30); do
  if curl --max-time 2 -fsS "http://127.0.0.1:$BACKEND_PORT/health" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    cat "$SMOKE_TMP_DIR/backend.log"
    exit 1
  fi
  sleep 0.2
done
if ! curl --max-time 2 -fsS "http://127.0.0.1:$BACKEND_PORT/health" >/dev/null; then
  cat "$SMOKE_TMP_DIR/backend.log"
  exit 1
fi
CONTAINER=$(docker run -d -p "$PORT:3000" --add-host=host.docker.internal:host-gateway \
  -e API_BASE_URL="http://host.docker.internal:$BACKEND_PORT" \
  -e HOSTNAME=eni-test-fargate.ecs.internal -e ALLOW_TURNSTILE_TEST_KEY=true \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN -e AWS_REGION "$IMAGE")
echo "Waiting for web server to be ready (max 30s)..."
for i in $(seq 1 60); do
  if curl -sf "http://localhost:$PORT/" >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "✗ Web server did not respond within 30s"
    docker logs "$CONTAINER"
    exit 1
  fi
  sleep 0.5
done

HTML_OUTPUT=$(curl -sS "http://localhost:$PORT/")
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "http://localhost:$PORT/")

if [ "$HTTP_CODE" != "200" ]; then
  echo "✗ / returned HTTP $HTTP_CODE"
  docker logs "$CONTAINER"
  exit 1
fi
echo "✓ / returned 200"

HEALTH_HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "http://localhost:$PORT/healthz")
if [ "$HEALTH_HTTP_CODE" != "200" ]; then
  echo "✗ /healthz returned HTTP $HEALTH_HTTP_CODE"
  docker logs "$CONTAINER"
  exit 1
fi
echo "✓ /healthz returned 200"

# Mirror the ECS container health check: probe loopback *inside* the container.
# This catches HOSTNAME bind mismatches — the ECS health check runs inside the
# container and connects to 127.0.0.1:3000, not through the published host port.
docker exec "$CONTAINER" node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
echo "✓ /healthz loopback (ECS health-check path) returned 200"

# Assert that test attributes are successfully stripped in production builds
if echo "$HTML_OUTPUT" | grep -qE 'data-(pw|testid)='; then
  echo "✗ HTML output contains unstripped test attributes (data-pw or data-testid) in production build"
  exit 1
fi
echo "✓ / returned 200 and test attributes are successfully stripped"
