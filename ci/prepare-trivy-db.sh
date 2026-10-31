#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The published file only runs trivy. pnpm dlx re-resolves vouchington-tooling
# and fails minimumReleaseAge when a just-mature parent requires a transitive
# that is still inside the window.
VOUCHINGTON_GHA_SKIP_DLX=1 exec bash "$here/exec-vouchington-gha.sh" prepare-trivy-db scripts/gha/prepare-trivy-db.sh "$@"
