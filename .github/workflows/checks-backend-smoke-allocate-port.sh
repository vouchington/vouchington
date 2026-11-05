#!/usr/bin/env bash
set -euo pipefail
PORT=$(python3 node_modules/vouchington-tooling/scripts/allocate-browser-safe-ports.py 1)
if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "::error::Port $PORT is already in use after allocation; deterministic allocation will not retry"
  exit 1
fi
echo "PORT=$PORT" >> "$GITHUB_ENV"
