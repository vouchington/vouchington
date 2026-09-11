#!/usr/bin/env bash
set -euo pipefail
export WORKER_VAR_NAMES="${WORKER_VAR_NAMES:-VITEST_MAX_WORKERS PLAYWRIGHT_MAX_WORKERS}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$here/exec-vouchington-gha.sh" load-runner-env scripts/gha/load-runner-env.sh "$@"
