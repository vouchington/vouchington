#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$(bash "$here/vouchington-tooling-script.sh" scripts/gha/check-needs-results.sh)" "$@"
