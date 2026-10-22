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
# vouchington-tooling imports its optional no-mistakes peer eagerly, so dlx must install it too.
nm_spec="$(
  node -e "const pkg=require(process.argv[1]); const spec=pkg.devDependencies?.['no-mistakes'] ?? pkg.dependencies?.['no-mistakes']; if (!spec) throw new Error('no-mistakes is not listed'); process.stdout.write(spec)" \
    "$repo/package.json"
)"
exec pnpm dlx --package "vouchington-tooling@${spec}" --package "no-mistakes@${nm_spec}" vouchington prepare-trivy-db "$@"
