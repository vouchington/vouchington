#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$here/exec-vouchington-gha.sh" make-shard-matrix scripts/gha/make-shard-matrix.sh "$@"
