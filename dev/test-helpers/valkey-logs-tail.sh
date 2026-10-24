#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" != -f ] || [ -z "${2:-}" ]; then
  printf "unexpected tail invocation: %s\n" "$*" >&2
  exit 2
fi
cat "$2"
