#!/usr/bin/env bash
# Publishes which backend images this run builds, from the checked-in worker-io flag.
set -euo pipefail
worker_io_automation_enabled="$(sed -n 's/^WORKER_IO_AUTOMATION_ENABLED=//p' .github/worker-io-automation.env)"
case "$worker_io_automation_enabled" in
  true|false) ;;
  *) echo 'WORKER_IO_AUTOMATION_ENABLED must be true or false' >&2; exit 1 ;;
esac
active_worker_images='worker-cpu'
if [ "$worker_io_automation_enabled" = 'true' ]; then
  active_worker_images="$active_worker_images worker-io"
fi
{
  echo "worker_io_automation_enabled=$worker_io_automation_enabled"
  echo "active_worker_images=$active_worker_images"
} >> "$GITHUB_OUTPUT"
