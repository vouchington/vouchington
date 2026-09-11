#!/usr/bin/env bash

set -u

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
[ "$#" -gt 0 ] || {
  echo 'usage: with-heavy-slot.sh <command> [args...]' >&2
  exit 2
}
wait_seconds=${VOUCHA_HEAVY_SLOT_WAIT_SECONDS:-60}
command_timeout=${VOUCHA_HEAVY_SLOT_COMMAND_TIMEOUT_SECONDS:-0}
on_acquire_timeout=fail

case "$wait_seconds" in
  '' | *[!0-9]* | 0) echo 'with-heavy-slot: VOUCHA_HEAVY_SLOT_WAIT_SECONDS must be a positive integer no greater than 60' >&2; exit 2 ;;
esac
[ "$wait_seconds" -le 60 ] || {
  echo 'with-heavy-slot: VOUCHA_HEAVY_SLOT_WAIT_SECONDS must be a positive integer no greater than 60' >&2
  exit 2
}

if [ "${GITHUB_ACTIONS:-}" = 'true' ]; then
  on_acquire_timeout=run-unlocked
fi

exec bash "$script_dir/with-host-lock.sh" \
  --name memory-heavy \
  --slots 1 \
  --timeout-seconds "$wait_seconds" \
  --command-timeout-seconds "$command_timeout" \
  --failure-diagnostics "$script_dir/host-pressure-diagnostics.sh" \
  --on-acquire-timeout "$on_acquire_timeout" \
  -- \
  "$@"
