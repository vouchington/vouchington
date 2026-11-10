#!/usr/bin/env bash
set -euo pipefail

# Reserve 60s readiness and 8s headroom after the pinned GHCR pull.
timeout --kill-after=2s 50s docker pull "$VALKEY_IMAGE"
docker run --pull=never -d --name "$VALKEY_CONTAINER" -p 127.0.0.1::6379 --tmpfs /data:rw,size=64m \
  "$VALKEY_IMAGE" >/dev/null
# Valkey has no readiness event to wait on, so poll `valkey-cli ping` under a hard deadline.
readiness_command='until docker exec "$0" valkey-cli ping >/dev/null 2>&1; do sleep 0.5; done'
if ! timeout 60 sh -c "$readiness_command" "$VALKEY_CONTAINER"; then
  echo "::error::Valkey did not answer PING within 60s"
  docker logs "$VALKEY_CONTAINER" 2>&1 | grep -v 'info.cc:[0-9]*: Defined Info Field: ' || true
  exit 1
fi
# Disposable test instance on tmpfs: skip RDB snapshots (and their log lines).
docker exec "$VALKEY_CONTAINER" valkey-cli config set save '' >/dev/null
port="$(docker port "$VALKEY_CONTAINER" 6379/tcp | head -n 1 | sed 's/.*://')"
if ! [[ "$port" =~ ^[0-9]+$ ]]; then
  echo "::error::Could not resolve the published Valkey host port"
  exit 1
fi
echo "VALKEY_URL=redis://127.0.0.1:${port}" >> "$GITHUB_ENV"
echo "url=redis://127.0.0.1:${port}" >> "$GITHUB_OUTPUT"
