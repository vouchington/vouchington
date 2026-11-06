#!/usr/bin/env bash
set -euo pipefail
: "${REGCTL:?Missing checksum-verified regctl path}"
: "${GHCR_TOKEN:?Missing GHCR write token}"
bash ci/dependency-mirror/sync.sh ci/dependency-mirror/images.json
