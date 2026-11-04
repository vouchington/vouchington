#!/usr/bin/env bash
# Smoke tests the worker-io image: boot, a heartbeat job, its IO-only contents, and a deployed-mode boot.
set -euo pipefail
IMAGE="$IMAGE_REPOSITORY/worker-io:$IMAGE_TAG"
WORKER_CONTAINER="voucha-worker-io-$$"

cleanup() {
  docker stop "$WORKER_CONTAINER" 2>/dev/null || true
  docker rm "$WORKER_CONTAINER" 2>/dev/null || true
}
trap cleanup EXIT

# Run only the universal heartbeat queue: exclude every IO-class queue the app expands
# from the worker queue policy (SQS consumers skip themselves without queue URLs).
WORKER_QUEUE_EXCLUDES=$(jq -er '(.ioCapableQueues - .sqsConsumerQueues) | if length == 0 then error("worker-io has no queues") else map("-" + .) | join(",") end' \
  backend/modules/worker-queue-inventory/worker-queue-policy.json)

echo "Starting worker-io container..."
docker run -d --name "$WORKER_CONTAINER" --network host \
  --env-file "$GITHUB_ACTION_PATH/s3-test-buckets.env" \
  -e NODE_ENV=test \
  -e QUEUES="$WORKER_QUEUE_EXCLUDES" \
  -e VALKEY_URL \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN -e AWS_REGION \
  "$IMAGE"

WORKER_READY=false
for _ in $(seq 1 20); do
  if ! docker inspect --format='{{.State.Running}}' "$WORKER_CONTAINER" 2>/dev/null | grep -q true; then
    echo "✗ Worker-io container stopped unexpectedly. Logs:"
    docker logs "$WORKER_CONTAINER"
    exit 1
  fi
  LOGS=$(docker logs "$WORKER_CONTAINER" 2>&1)
  if echo "$LOGS" | grep -qE "(^|[[:space:]])(Error:|Cannot find module|ENOENT|EACCES)"; then
    echo "✗ Worker-io failed during initialization. Logs:"
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
  echo "✗ Worker-io did not finish initializing within 10s. Logs:"
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

# worker-io is the IO-only image: the compile script fails the image build when its
# executable bundles sharp or vurst-ai, and this checks that none of their shared
# libraries (libvips, onnxruntime) ship beside it. A separate container reads the
# directory with the base image's Node, so it does not compete with the running worker.
WORKER_IO_LIBRARIES=$(docker run --rm --entrypoint /nodejs/bin/node "$IMAGE" -e \
  'process.stdout.write(require("node:fs").readdirSync("/app/backend/lib").sort().join(" "))')
if [ "$WORKER_IO_LIBRARIES" != "libduckdb.so" ]; then
  echo "✗ Worker-io ships shared libraries beyond libduckdb.so (should be IO-only): $WORKER_IO_LIBRARIES"
  exit 1
fi
echo "✓ Worker-io ships only libduckdb.so"
# The executable runs embedded native addons from temporary copies in TMPDIR, so that
# directory must be writable by the nonroot user the image runs as.
docker exec "$WORKER_CONTAINER" /nodejs/bin/node -e 'const fs=require("node:fs");const dir=process.env.TMPDIR;if(process.getuid()!==65532)throw new Error("not uid 65532");fs.accessSync(dir,fs.constants.W_OK);const addons=fs.readdirSync(dir).filter(name=>name.startsWith(".bun-65532-")&&name.endsWith(".node"));if(addons.length===0)throw new Error("no embedded native addon extracted to "+dir);console.log("✓ "+addons.length+" native addons extracted to "+dir+" as uid 65532")'
# NODE_ENV=test skips the signal handlers; prove a deployed-mode boot and a clean stop.
"$GITHUB_ACTION_PATH/deployed-boot-smoke.sh" "$IMAGE" "Workers: workers loaded." \
  -e QUEUES="$WORKER_QUEUE_EXCLUDES"

echo "✓ Worker-io smoke test passed"
