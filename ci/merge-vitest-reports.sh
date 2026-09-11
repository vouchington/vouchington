#!/usr/bin/env bash
set -euo pipefail

primary_dir="${1:-./vitest-blob-primary}"
fallback_dir="${2:-./vitest-blob-fallback}"
merge_dir="${3:-./vitest-blob-reports/merge-input}"

pnpm exec vouchington prepare-vitest-reports "$primary_dir" "$fallback_dir" "$merge_dir"

if find "$merge_dir" -type f -name '*.json' -print -quit | grep -q .; then
  pnpm exec vitest run --merge-reports="$merge_dir" --passWithNoTests
else
  echo "No Vitest blob reports expected for this change set."
fi
