#!/usr/bin/env bash
set -euo pipefail
npm install -g "bun@$BUN_VERSION"
OUT_DIR="$RUNNER_TEMP/bun-executables-$BUN_VERSION"
bun backend/scripts/build/compile-backend-binaries.mts "$OUT_DIR"
{
  echo "API_EXECUTABLE=$OUT_DIR/api"
  echo "WORKER_IO_EXECUTABLE=$OUT_DIR/worker-io"
  echo "LD_LIBRARY_PATH=$OUT_DIR/lib"
  cat .github/actions/build-backend-images/s3-test-buckets.env
} >> "$GITHUB_ENV"
