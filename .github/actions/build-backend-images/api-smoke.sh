#!/usr/bin/env bash
# Smoke tests the API image: serving, health check, one-off entrypoints, and a deployed-mode boot.
set -euo pipefail
IMAGE="$IMAGE_REPOSITORY/api:$IMAGE_TAG"
PORT=$(python3 "$RUNNER_TEMP/vouchington-tooling/node_modules/vouchington-tooling/scripts/allocate-browser-safe-ports.py" 1)
SERVER_CONTAINER="voucha-api-server-$$"
POSTGRES_CONTAINER="voucha-api-postgres-$$"

cleanup() {
  docker stop "$SERVER_CONTAINER" 2>/dev/null || true
  docker rm "$SERVER_CONTAINER" 2>/dev/null || true
  docker rm -f "$POSTGRES_CONTAINER" 2>/dev/null || true
}
trap cleanup EXIT

echo "Starting API container on port $PORT..."
docker run -d --name "$SERVER_CONTAINER" --network host \
  --env-file "$GITHUB_ACTION_PATH/s3-test-buckets.env" \
  -e NODE_ENV=test -e PORT="$PORT" -e VALKEY_URL \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN -e AWS_REGION \
  "$IMAGE"

echo "Waiting for API to be ready (max 30s)..."
for i in $(seq 1 60); do
  if curl -sf "http://localhost:$PORT/infra/ping" >/dev/null 2>&1; then
    echo "✓ API is ready"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "✗ API did not become ready within 30s. Logs:"
    docker logs "$SERVER_CONTAINER"
    exit 1
  fi
  sleep 0.5
done

TMPFILE=$(mktemp)
HTTP_CODE=$(curl -s -o "$TMPFILE" -w "%{http_code}" "http://localhost:$PORT/infra/ping")
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
# Run the supported executable command that infrastructure uses for its local HTTP probe.
docker exec "$SERVER_CONTAINER" /app/backend/api healthcheck.mts
echo "✓ ECS health check command passed"
if docker exec -e PORT=1 "$SERVER_CONTAINER" /app/backend/api healthcheck.mts; then
  echo "✗ Health command succeeded without an HTTP listener"
  exit 1
fi
echo "✓ ECS health check command failed without a listener"
# The executable runs embedded native addons from temporary copies in TMPDIR, so that
# directory must be writable by the nonroot user the image runs as.
docker exec "$SERVER_CONTAINER" /app/backend/api image-smoke.mts

echo "Running deployed Valkey diagnostic in a fresh container..."
DIAGNOSTIC_OUTPUT=$(docker run --rm --network host \
  -e NODE_ENV=test -e ENVIRONMENT=test -e VALKEY_URL \
  "$IMAGE" valkey-admin.mts diagnose)
printf '%s\n' "$DIAGNOSTIC_OUTPUT" | jq -s -e '
  length == 1 and
  (.[0] |
  keys == ["environment", "memory", "observedFlushTargetKeyCounts", "operation", "schemaVersion", "timestamp"] and
  .schemaVersion == 1 and .operation == "diagnose" and .environment == "test" and
  (.timestamp | type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$")) and
  (.memory | keys == ["lazyfreePendingObjects", "maxmemoryBytes", "maxmemoryPolicy", "memFragmentationRatio", "usedMemoryBytes", "usedMemoryDatasetBytes", "usedMemoryPeakBytes", "usedMemoryRssBytes"]) and
  (.memory.usedMemoryBytes | type == "number") and
  (.memory.usedMemoryRssBytes | type == "number") and
  (.memory.usedMemoryPeakBytes | type == "number") and
  (.memory.maxmemoryBytes | type == "number") and
  (.memory.maxmemoryPolicy | type == "string" and length > 0) and
  ([.memory.usedMemoryDatasetBytes, .memory.lazyfreePendingObjects, .memory.memFragmentationRatio] | all(. == null or type == "number")) and
  (.observedFlushTargetKeyCounts | keys == ["blooms", "caches", "dynamic-config", "queues", "rate-limiter", "recently-viewed", "sessions", "unclassified"]) and
  ([.observedFlushTargetKeyCounts[]] | all(type == "number" and . >= 0 and floor == .)))
' >/dev/null
echo "✓ Deployed Valkey diagnostic returned schema-version 1 JSON"

# The infrastructure one-off tasks run these entrypoints from the compiled image, so run
# both against a disposable database that exists only for this step.
echo "Starting disposable PostgreSQL for the schema reset and migrate entrypoints..."
POSTGRES_PORT=$(python3 "$RUNNER_TEMP/vouchington-tooling/node_modules/vouchington-tooling/scripts/allocate-browser-safe-ports.py" 1)
docker run -d --name "$POSTGRES_CONTAINER" -p "127.0.0.1:$POSTGRES_PORT:5432" \
  -e POSTGRES_USER=postgres -e POSTGRES_DB=postgres -e POSTGRES_HOST_AUTH_METHOD=trust \
  ghcr.io/vouchington/dependency-pgvector:pg18@sha256:691673308c99d2161ba298736f3147f1f22d79de2fb7ec93ae9b4afcab870b62 >/dev/null
for i in $(seq 1 60); do
  if docker exec "$POSTGRES_CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "✗ Disposable PostgreSQL did not become ready within 30s. Logs:"
    docker logs "$POSTGRES_CONTAINER"
    exit 1
  fi
  sleep 0.5
done
RESET_DATABASE_URL="postgres://postgres@127.0.0.1:$POSTGRES_PORT/postgres"
# The second reset runs over the fully migrated schema at PostgreSQL's default lock
# settings, which is where an unbatched DROP SCHEMA CASCADE runs out of shared memory.
for ENTRYPOINT in schema-reset.mts schema-reset.mts migrate.mts; do
  docker run --rm --network host \
    -e NODE_ENV=staging -e ENVIRONMENT=staging -e ALLOW_STAGING_SCHEMA_RESET=true \
    -e DATABASE_URL="$RESET_DATABASE_URL" -e VALKEY_URL \
    "$IMAGE" "$ENTRYPOINT"
  echo "✓ $ENTRYPOINT exited 0"
done
MIGRATED=$(docker exec "$POSTGRES_CONTAINER" psql -U postgres -d postgres -Atc "SELECT to_regclass('public.users') IS NOT NULL")
if [ "$MIGRATED" != "t" ]; then
  echo "✗ public.users is missing after schema-reset.mts and migrate.mts"
  exit 1
fi
echo "✓ schema-reset.mts (twice) and migrate.mts ran on the compiled image and public.users exists"

# A command that names no entrypoint (the Node shape of an --eval override) must fail
# instead of serving. The timeout turns a regression that serves into a failed check.
STATUS=0
UNKNOWN_OUTPUT=$(timeout 30 docker run --rm --network host \
  -e NODE_ENV=test -e ENVIRONMENT=test -e VALKEY_URL \
  "$IMAGE" --experimental-strip-types --input-type=module --eval 'x' 2>&1) || STATUS=$?
if [ "$STATUS" = 0 ] || [ "$STATUS" = 124 ] || ! grep -qF 'Unknown executable command' <<<"$UNKNOWN_OUTPUT"; then
  echo "✗ the API image did not reject an unknown command (exit $STATUS). Output:"
  echo "$UNKNOWN_OUTPUT"
  exit 1
fi
echo "✓ an unknown command exited $STATUS without serving"

# The staging Aurora wake keeps a connection open for the duration it is given; one second
# ends within about a second. Outside staging it must refuse before connecting.
timeout 30 docker run --rm --network host \
  -e NODE_ENV=staging -e ENVIRONMENT=staging \
  -e DATABASE_URL="$RESET_DATABASE_URL" -e VALKEY_URL \
  "$IMAGE" staging-aurora-wake.mts 1
echo "✓ staging-aurora-wake.mts 1 exited 0"
# A wake that never reaches the database must fail, not report that Aurora stayed awake.
STATUS=0
timeout 30 docker run --rm --network host \
  -e NODE_ENV=staging -e ENVIRONMENT=staging \
  -e DATABASE_URL="postgres://postgres@127.0.0.1:1/postgres" -e VALKEY_URL \
  "$IMAGE" staging-aurora-wake.mts 1 >/dev/null 2>&1 || STATUS=$?
if [ "$STATUS" = 0 ] || [ "$STATUS" = 124 ]; then
  echo "✗ staging-aurora-wake.mts did not fail without a database (exit $STATUS)"
  exit 1
fi
echo "✓ staging-aurora-wake.mts failed without a database (exit $STATUS)"
STATUS=0
timeout 30 docker run --rm --network host \
  -e NODE_ENV=staging -e ENVIRONMENT=production \
  -e DATABASE_URL="$RESET_DATABASE_URL" -e VALKEY_URL \
  "$IMAGE" staging-aurora-wake.mts 1 >/dev/null 2>&1 || STATUS=$?
if [ "$STATUS" = 0 ] || [ "$STATUS" = 124 ]; then
  echo "✗ staging-aurora-wake.mts did not refuse a non-staging environment (exit $STATUS)"
  exit 1
fi
echo "✓ staging-aurora-wake.mts refused a non-staging environment (exit $STATUS)"

# Every run above uses NODE_ENV=test, which skips the signal handlers and the deployed-only
# boot guards. Boot the way a deployed task does and require a clean exit on docker stop.
DEPLOYED_PORT=$(python3 "$RUNNER_TEMP/vouchington-tooling/node_modules/vouchington-tooling/scripts/allocate-browser-safe-ports.py" 1)
"$GITHUB_ACTION_PATH/deployed-boot-smoke.sh" "$IMAGE" "API Server: serving" \
  -e PORT="$DEPLOYED_PORT" -e DATABASE_URL="$RESET_DATABASE_URL"
echo "✓ API smoke test passed"
