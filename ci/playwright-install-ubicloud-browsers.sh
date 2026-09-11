#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$here/exec-vouchington-gha.sh" install-playwright-chromium-arm64 \
  scripts/gha/install-playwright-chromium-arm64.sh "$@"
