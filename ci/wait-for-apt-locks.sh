#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$here/exec-vouchington-gha.sh" wait-for-apt-locks scripts/gha/wait-for-apt-locks.sh "$@"
