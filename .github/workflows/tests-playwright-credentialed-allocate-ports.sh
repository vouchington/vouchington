#!/usr/bin/env bash
# One call keeps every app port distinct.
set -euo pipefail
PORTS=$(python3 node_modules/vouchington-tooling/scripts/allocate-browser-safe-ports.py 4)
read -r PORT NEXT_PORT IMAGE_LAMBDA_PORT WORKER_PORT <<< "$PORTS"
if [ -z "$PORT" ] || [ -z "$NEXT_PORT" ] || [ -z "$IMAGE_LAMBDA_PORT" ] || [ -z "$WORKER_PORT" ]; then
  echo "::error::Failed to allocate ports"
  exit 1
fi
{
  echo "PORT=$PORT"
  echo "NEXT_PORT=$NEXT_PORT"
  echo "IMAGE_LAMBDA_PORT=$IMAGE_LAMBDA_PORT"
  echo "WORKER_PORT=$WORKER_PORT"
} >> "$GITHUB_ENV"
