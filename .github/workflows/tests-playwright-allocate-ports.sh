#!/usr/bin/env bash
# One call keeps every app and collector port distinct.
set -euo pipefail
PORTS=$(python3 node_modules/vouchington-tooling/scripts/allocate-browser-safe-ports.py 6)
read -r PORT NEXT_PORT IMAGE_LAMBDA_PORT WORKER_PORT OTEL_HTTP_PORT OTEL_GRPC_PORT <<< "$PORTS"
if [ -z "$PORT" ] || [ -z "$NEXT_PORT" ] || [ -z "$IMAGE_LAMBDA_PORT" ] || [ -z "$WORKER_PORT" ] || [ -z "$OTEL_HTTP_PORT" ] || [ -z "$OTEL_GRPC_PORT" ]; then
  echo "::error::Failed to allocate ports"
  exit 1
fi
{
  echo "PORT=$PORT"
  echo "NEXT_PORT=$NEXT_PORT"
  echo "IMAGE_LAMBDA_PORT=$IMAGE_LAMBDA_PORT"
  echo "WORKER_PORT=$WORKER_PORT"
  echo "OTEL_HTTP_PORT=$OTEL_HTTP_PORT"
  echo "OTEL_GRPC_PORT=$OTEL_GRPC_PORT"
  echo "OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:$OTEL_HTTP_PORT"
} >> "$GITHUB_ENV"
