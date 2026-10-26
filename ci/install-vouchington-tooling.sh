#!/usr/bin/env bash
# Install published tooling and its complete transitive graph from the workspace
# lockfile. The shared pnpm release-age policy governs dependency admission;
# frozen installation never resolves a newly published transitive version.
set -euo pipefail
if [ "$#" -ne 2 ]; then
  echo "usage: $0 <dest-dir> <package-json>" >&2
  exit 2
fi
dest="$1"
pkg_json="$2"
repo="$(cd "$(dirname "$pkg_json")" && pwd)"

# Keep the existing isolated node_modules/vouchington-tooling consumer paths.
# Ignore lifecycle scripts and a prior PR-controlled user registry configuration.
export npm_config_userconfig=/dev/null
export npm_config_registry=https://registry.npmjs.org/
pnpm --dir "$repo" install --frozen-lockfile --filter @voucha/ci... --prod --ignore-scripts
pnpm --dir "$repo" --filter @voucha/ci deploy --prod --legacy --ignore-scripts --frozen-lockfile "$dest"
