#!/usr/bin/env bash
set -euo pipefail
# Leave 10s for reaping, 60s for upload, and 60s for shell/post-step work.
deadline="${CREDENTIALED_JOB_DEADLINE_EPOCH:?Missing validated job deadline}"
if [[ ! "$deadline" =~ ^[0-9]+$ ]]; then
  echo "::error::Invalid validated job deadline"
  exit 1
fi
remaining=$((deadline - $(date +%s) - 130))
if [ "$remaining" -le 0 ]; then
  echo "::error::Insufficient remaining job time; credentialed command was not started"
  exit 1
fi
command_budget=420
if [ "$remaining" -lt "$command_budget" ]; then command_budget="$remaining"; fi
python3 "$GITHUB_WORKSPACE/node_modules/vouchington-tooling/scripts/run-bounded.py" "$command_budget" pnpm exec ./ci/with-node-test-options playwright test --config playwright.credentialed.config.mts && test_exit=0 || test_exit=$?
# `trace: 'on-first-retry'` (playwright/config/shared-config.mts, shared by this
# config) writes a trace.zip only for a test's first retry attempt, so its presence
# under test-results/ is a direct signal that something retried in this run -- a
# flake if the retry then passed, a confirmed failure otherwise. Same rationale as
# the sharded tests-playwright.yml job's run-playwright step.
if find test-results -name 'trace.zip' -print -quit 2>/dev/null | grep -q .; then
  echo "retried=true" >> "${GITHUB_OUTPUT:-/dev/null}"
else
  echo "retried=false" >> "${GITHUB_OUTPUT:-/dev/null}"
fi
exit "$test_exit"
