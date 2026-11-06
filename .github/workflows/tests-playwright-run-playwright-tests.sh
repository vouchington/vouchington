#!/usr/bin/env bash
set -euo pipefail
if [ -r /proc/meminfo ]; then
  # sleep's output is discarded so the trap never waits on a pipe.
  # Monitor mode puts the loop in its own process group: killing only
  # the subshell leaves sleep behind, and the runner's orphan cleanup
  # can sit on "Terminate orphan process: (sleep)" until the job cap
  # cancels a shard whose tests already passed.
  set -m
  (while sleep 30 >/dev/null 2>&1; do
    awk '/^(MemAvailable|SwapFree):/ { printf "%s %d MiB ", $1, $2 / 1024 } END { print "" }' /proc/meminfo
    ps -eo rss=,comm= --sort=-rss | head -3 | awk '{ printf "  %d MiB %s\n", $1 / 1024, $2 }'
  done) &
  sampler=$!
  # status is assigned when the EXIT trap runs.
  # shellcheck disable=SC2154
  trap 'status=$?; kill -KILL -- -"$sampler" 2>/dev/null || kill -KILL "$sampler" 2>/dev/null || true; exit "$status"' EXIT
fi
python3 "$GITHUB_WORKSPACE/node_modules/vouchington-tooling/scripts/run-bounded.py" 480 pnpm exec ./ci/with-node-test-options playwright test "--shard=$CI_SHARD" && test_exit=0 || test_exit=$?
# `trace: 'on-first-retry'` (playwright/config/shared-config.mts) writes a
# trace.zip only for a test's first retry attempt, so its presence under
# test-results/ is a direct signal that something retried in this shard —
# a flake if the retry then passed, a confirmed failure otherwise. Surface
# it as a step output so future alerting can key off retries directly
# instead of inferring them from the job's overall conclusion.
if find test-results -name 'trace.zip' -print -quit 2>/dev/null | grep -q .; then
  echo "retried=true" >> "${GITHUB_OUTPUT:-/dev/null}"
else
  echo "retried=false" >> "${GITHUB_OUTPUT:-/dev/null}"
fi
exit "$test_exit"
