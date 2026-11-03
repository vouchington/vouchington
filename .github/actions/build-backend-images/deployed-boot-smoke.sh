#!/usr/bin/env bash
# Boots a backend image the way a deployed task does (NODE_ENV=staging, so graceful-shutdown
# registers its signal handlers and the deployed-only boot guards run), then stops it with
# `docker stop` and requires exit code 0. Every other smoke step runs NODE_ENV=test, which skips
# both, so a deployed-only boot failure or a broken SIGTERM path would otherwise pass CI.
#
# usage: deployed-boot-smoke.sh <image> <ready-log-line> [extra docker run args...]
# All secrets here are synthetic and exist only for this container.
set -euo pipefail

IMAGE="$1"
READY_LINE="$2"
shift 2
NAME="voucha-deployed-boot-$$"
ACTION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

SESSION_KEY=$(node -e "
const { generateKeyPairSync } = require('node:crypto')
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...privateKey.export({ format: 'jwk' }), alg: 'RS512', use: 'sig', kid: 'synthetic-smoke' }
process.stdout.write(Buffer.from(JSON.stringify(jwk)).toString('base64'))
")

docker run -d --name "$NAME" --network "${SMOKE_DOCKER_NETWORK:-host}" \
  --env-file "$ACTION_DIR/s3-test-buckets.env" \
  -e NODE_ENV=staging -e ENVIRONMENT=staging \
  -e IMAGE_ORIGIN=https://images.example.test \
  -e CLOUDFLARE_TURNSTILE_SECRET_KEY=synthetic-smoke-turnstile-secret \
  -e CF_WORKER_SECRET=synthetic-smoke-worker-secret-0123456789 \
  -e VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64="$SESSION_KEY" \
  -e VALKEY_URL \
  "$@" "$IMAGE" >/dev/null

READY=false
for _ in $(seq 1 60); do
  if ! docker inspect --format='{{.State.Running}}' "$NAME" 2>/dev/null | grep -q true; then
    echo "✗ $IMAGE exited during a deployed-mode boot. Logs:"
    docker logs "$NAME" 2>&1
    exit 1
  fi
  if docker logs "$NAME" 2>&1 | grep -qF "$READY_LINE"; then
    READY=true
    break
  fi
  sleep 0.5
done
if [ "$READY" = false ]; then
  echo "✗ $IMAGE did not log '$READY_LINE' within 30s of a deployed-mode boot. Logs:"
  docker logs "$NAME" 2>&1
  exit 1
fi
echo "✓ $IMAGE booted with NODE_ENV=staging"

docker stop --timeout 30 "$NAME" >/dev/null
EXIT_CODE=$(docker inspect --format='{{.State.ExitCode}}' "$NAME")
if [ "$EXIT_CODE" != "0" ]; then
  echo "✗ docker stop ended $IMAGE with exit code $EXIT_CODE, expected 0. Logs:"
  docker logs "$NAME" 2>&1
  exit 1
fi
echo "✓ $IMAGE exited 0 on docker stop"
