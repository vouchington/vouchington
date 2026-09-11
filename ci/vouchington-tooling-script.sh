#!/usr/bin/env bash
# Print the absolute path of a file inside the installed vouchington-tooling package.
set -euo pipefail
if [ "$#" -ne 1 ]; then
  echo "usage: $0 <relative-path-from-package-root>" >&2
  exit 2
fi
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
path="$(
  node -e "const { dirname, join } = require('node:path'); const { createRequire } = require('node:module'); const r = createRequire(process.argv[1]); process.stdout.write(join(dirname(r.resolve('vouchington-tooling/package.json')), process.argv[2]))" \
    "$here/../package.json" "$1"
)"
if [ ! -f "$path" ]; then
  echo "$0: packaged file missing: $path" >&2
  exit 1
fi
printf '%s' "$path"
