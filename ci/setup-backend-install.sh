#!/usr/bin/env bash

set -euo pipefail

runner_lifecycle="${1:-}"
if [ "$runner_lifecycle" != "persistent" ]; then
  echo "::error::setup-backend requires runner-lifecycle: persistent"
  exit 1
fi

bash "$GITHUB_WORKSPACE/ci/pnpm-install.sh" \
  --runner-lifecycle persistent \
  --install-scripts true \
  --command-timeout-seconds 0
