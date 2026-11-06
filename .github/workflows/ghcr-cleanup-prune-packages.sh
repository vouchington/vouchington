#!/usr/bin/env bash
set -euo pipefail
if [ "$APPLY" = 'true' ]; then
  bash "$RUNNER_TEMP/vouchington-tooling/node_modules/vouchington-tooling/scripts/gha/ghcr-package-retention.sh" --main-history --apply
else
  bash "$RUNNER_TEMP/vouchington-tooling/node_modules/vouchington-tooling/scripts/gha/ghcr-package-retention.sh" --main-history --dry-run
fi
