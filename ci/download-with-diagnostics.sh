#!/usr/bin/env bash
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
helper="$(
  bash "$here/vouchington-tooling-script.sh" scripts/gha/download-with-diagnostics.sh 2>/dev/null || true
)"
if [ -n "$helper" ] && [ -f "$helper" ]; then
  # shellcheck disable=SC1090
  source "$helper"
else
  # Persistent trees can still have a pre-0.0.5 package with no scripts/gha.
  # shellcheck disable=SC1091
  source "$here/curl-to.sh"
fi
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  ci_download_to "$@"
fi
