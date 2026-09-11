#!/usr/bin/env bash
# Store Playwright OTel artifacts to S3.
#
# Required environment variables:
#   OTEL_OUTPUT_ROOT  — directory containing playwright-otel-output-shard-* subdirs
#   OTEL_STORE_URI    — S3 URI prefix (s3://bucket/prefix/...) for uploads
set -euo pipefail

if [ -z "${OTEL_OUTPUT_ROOT:-}" ] || [ -z "${OTEL_STORE_URI:-}" ]; then
  echo "::error::OTEL_OUTPUT_ROOT and OTEL_STORE_URI environment variables must be set and non-empty"
  exit 1
fi

found=false
store_artifact_dir() {
  local artifact_dir="$1"
  local shard="$2"

  if [ -d "$artifact_dir/otel-output" ]; then
    aws s3 cp "$artifact_dir/otel-output" "$OTEL_STORE_URI/$shard/otel" --recursive
  fi
  if [ -d "$artifact_dir/playwright-web-server-logs" ]; then
    aws s3 cp "$artifact_dir/playwright-web-server-logs" "$OTEL_STORE_URI/$shard/web-server-logs" --recursive
  fi
}

for artifact_dir in "$OTEL_OUTPUT_ROOT"/playwright-otel-output-shard-*; do
  if [ ! -d "$artifact_dir" ]; then
    continue
  fi
  found=true
  artifact_name="$(basename "$artifact_dir")"
  shard="${artifact_name#playwright-otel-output-}"
  store_artifact_dir "$artifact_dir" "$shard"
done

if [ "$found" != "true" ] &&
  { [ -d "$OTEL_OUTPUT_ROOT/otel-output" ] || [ -d "$OTEL_OUTPUT_ROOT/playwright-web-server-logs" ]; }; then
  found=true
  store_artifact_dir "$OTEL_OUTPUT_ROOT" "shard-single"
fi

if [ "$found" != "true" ]; then
  echo "::error::No Playwright OTel artifacts found"
  exit 1
fi
