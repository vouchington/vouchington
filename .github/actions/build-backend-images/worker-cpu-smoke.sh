#!/usr/bin/env bash
# Smoke tests the worker-cpu image: boot, a heartbeat job, native addons, and a deployed-mode boot.
set -euo pipefail
IMAGE="$IMAGE_REPOSITORY/worker-cpu:$IMAGE_TAG"
WORKER_CONTAINER="voucha-worker-cpu-$$"

cleanup() {
  docker stop "$WORKER_CONTAINER" 2>/dev/null || true
  docker rm "$WORKER_CONTAINER" 2>/dev/null || true
}
trap cleanup EXIT

echo "Starting worker-cpu container..."
docker run -d --name "$WORKER_CONTAINER" --network host \
  --env-file "$GITHUB_ACTION_PATH/s3-test-buckets.env" \
  -e NODE_ENV=test \
  -e VALKEY_URL \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN -e AWS_REGION \
  "$IMAGE"

WORKER_READY=false
for _ in $(seq 1 20); do
  if ! docker inspect --format='{{.State.Running}}' "$WORKER_CONTAINER" 2>/dev/null | grep -q true; then
    echo "✗ Worker-cpu container stopped unexpectedly. Logs:"
    docker logs "$WORKER_CONTAINER"
    exit 1
  fi
  LOGS=$(docker logs "$WORKER_CONTAINER" 2>&1)
  if echo "$LOGS" | grep -qE "(^|[[:space:]])(Error:|Cannot find module|ENOENT|EACCES)"; then
    echo "✗ Worker-cpu failed during initialization. Logs:"
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
  echo "✗ Worker-cpu did not finish initializing within 10s. Logs:"
  docker logs "$WORKER_CONTAINER"
  exit 1
fi

echo "Enqueueing heartbeat job from a second container of the image..."
docker run --rm --network host \
  --env-file "$GITHUB_ACTION_PATH/s3-test-buckets.env" \
  -e NODE_ENV=test -e VALKEY_URL \
  "$IMAGE" enqueue-heartbeat.mts

JOB_DONE=false
for _ in $(seq 1 30); do
  WORKER_LOGS=$(docker logs "$WORKER_CONTAINER" 2>&1)
  if echo "$WORKER_LOGS" | grep -q "job completed: heartbeat"; then
    JOB_DONE=true
    break
  fi
  sleep 0.5
done

if [ "$JOB_DONE" = false ]; then
  echo "✗ Heartbeat job did not complete within 15s. Logs:"
  docker logs "$WORKER_CONTAINER"
  exit 1
fi
echo "✓ Heartbeat job completed"

echo "Checking native addons that load on first use..."
docker run --rm --network host --user 65532:65532 \
  --env-file "$GITHUB_ACTION_PATH/s3-test-buckets.env" \
  -e NODE_ENV=test -e VALKEY_URL \
  "$IMAGE" check-native-addons.mts
# The executable runs embedded native addons from temporary copies in TMPDIR, so that
# directory must be writable by the nonroot user the image runs as.
docker exec "$WORKER_CONTAINER" /nodejs/bin/node -e 'const fs=require("node:fs");const dir=process.env.TMPDIR;if(process.getuid()!==65532)throw new Error("not uid 65532");fs.accessSync(dir,fs.constants.W_OK);const addons=fs.readdirSync(dir).filter(name=>name.startsWith(".bun-65532-")&&name.endsWith(".node"));if(addons.length===0)throw new Error("no embedded native addon extracted to "+dir);console.log("✓ "+addons.length+" native addons extracted to "+dir+" as uid 65532")'

# NODE_ENV=test skips the signal handlers; prove a deployed-mode boot and a clean stop.
"$GITHUB_ACTION_PATH/deployed-boot-smoke.sh" "$IMAGE" "Workers: workers loaded."

echo "✓ Worker-cpu smoke test passed"
