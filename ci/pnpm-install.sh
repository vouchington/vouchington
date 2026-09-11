#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"
export PNPM_INSTALL_DOCS_URL="${PNPM_INSTALL_DOCS_URL:-docs/development/reference-dependency-updates-supply-chain-policy.md for the temporary-exemption procedure}"
# Always dlx the spec from package.json. A persistent tree can have an older
# vouchington-tooling in node_modules that lacks the ./pnpm-install export, so
# importing the installed package here is not a safe bootstrap.
spec="$(
  node -e "const pkg=require(process.argv[1]); const spec=pkg.dependencies?.['vouchington-tooling'] ?? pkg.devDependencies?.['vouchington-tooling']; if (!spec) throw new Error('vouchington-tooling is not listed in ' + process.argv[1]); process.stdout.write(spec)" \
    "$repo/package.json"
)"
spec="${spec#^}"
if [ "${PNPM_INSTALL_PRINT_SPEC:-}" = 1 ]; then
  printf '%s\n' "$spec"
  exit 0
fi
exec pnpm dlx --package "vouchington-tooling@${spec}" vouchington pnpm-install "$@"
