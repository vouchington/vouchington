#!/usr/bin/env bash
set -eo pipefail

case "$SHARED_BUILD_CACHE_MODE" in
  producer|consumer) ;;
  *)
    echo "shared-build-cache-mode must be producer or consumer; got $SHARED_BUILD_CACHE_MODE" >&2
    exit 1
    ;;
esac
