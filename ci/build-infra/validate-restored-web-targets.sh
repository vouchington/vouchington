#!/usr/bin/env bash
set -eo pipefail

if [ "$CACHE_HIT" = 'true' ] && \
  python3 "$GITHUB_WORKSPACE/node_modules/vouchington-tooling/scripts/run-bounded.py" 30 node ci/web-build-cache-manifest.mts verify; then
  echo 'complete=true' >> "$GITHUB_OUTPUT"
else
  echo 'complete=false' >> "$GITHUB_OUTPUT"
fi
