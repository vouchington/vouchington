#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"

packaged="$(
  bash "$here/vouchington-tooling-script.sh" scripts/gha/prepare-trivy-db.sh 2>/dev/null || true
)"
if [ -n "$packaged" ] && [ -f "$packaged" ]; then
  exec bash "$packaged" "$@"
fi

spec="$(
  node -e "const pkg=require(process.argv[1]); const spec=pkg.dependencies?.['vouchington-tooling'] ?? pkg.devDependencies?.['vouchington-tooling']; if (!spec) throw new Error('vouchington-tooling is not listed in ' + process.argv[1]); process.stdout.write(spec)" \
    "$repo/package.json"
)"
spec="${spec#^}"
exec pnpm dlx --package "vouchington-tooling@${spec}" vouchington prepare-trivy-db "$@"
