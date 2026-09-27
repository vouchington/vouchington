#!/usr/bin/env bash
set -euo pipefail
exec node ci/image-retention-cli.mts "$@"
