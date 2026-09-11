#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
helper="$(
  bash "$here/vouchington-tooling-script.sh" scripts/gha/host-pressure-diagnostics.sh 2>/dev/null || true
)"
if [ -n "$helper" ] && [ -f "$helper" ]; then
  exec bash "$helper" "$@"
fi
# Failure diagnostics must not replace the original command's exit code when a
# leftover pre-0.0.5 package has no scripts/gha helper.
echo "host-pressure-diagnostics: packaged helper missing; skipping" >&2
exit 0
