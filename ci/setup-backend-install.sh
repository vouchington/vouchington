#!/usr/bin/env bash

set -euo pipefail

bash "$GITHUB_WORKSPACE/ci/pnpm-install.sh" \
  --runner-lifecycle ephemeral-full \
  --install-scripts true \
  --command-timeout-seconds 0
