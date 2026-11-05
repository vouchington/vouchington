#!/usr/bin/env bash
set -euo pipefail
echo "Starting OTel collector"
mkdir -p "$RUNNER_TEMP/otel-output"
chmod 0777 "$RUNNER_TEMP/otel-output"
COLLECTOR_NAME="voucha-otel-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}-${SHARD}"
docker run -d --name "$COLLECTOR_NAME" \
  -p "127.0.0.1:$OTEL_HTTP_PORT:4318" \
  -p "127.0.0.1:$OTEL_GRPC_PORT:4317" \
  -v "$PWD/dev/otel/collector-config-ci.yaml:/etc/otelcol-contrib/config.yaml:ro" \
  -v "$RUNNER_TEMP/otel-output:/otel-output" \
  ghcr.io/vouchington/dependency-otel:0.153.0@sha256:93aad750175cbf1a973ae1c5886c3371f4d800f61be25cdd26870b8441ffe9fa
sleep 2
if [ "$(docker inspect -f '{{.State.Running}}' "$COLLECTOR_NAME")" != "true" ]; then
  docker logs "$COLLECTOR_NAME" || true
  exit 1
fi
