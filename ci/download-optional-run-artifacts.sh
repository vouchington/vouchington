#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$here/exec-vouchington-gha.sh" download-optional-run-artifacts scripts/gha/download-optional-run-artifacts.sh "$@"
