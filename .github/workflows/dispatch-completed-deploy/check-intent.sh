#!/usr/bin/env bash
set -euo pipefail
should_dispatch=true
intent_job=
case "$SOURCE_WORKFLOW_PATH" in
  .github/workflows/main-backend.yml) intent_job=backend-deploy-intent ;;
  .github/workflows/main-web.yml) intent_job=web-deploy-intent ;;
esac
if [ -n "$intent_job" ]; then
  intent_filter="[.jobs[] | select(.name == \"$intent_job\" and .conclusion == \"success\")] | length"
  successful_intent_jobs=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$SOURCE_RUN_ID/jobs?filter=all&per_page=100" \
    --jq "$intent_filter")
  if [ "$successful_intent_jobs" = 0 ]; then should_dispatch=false; fi
fi
echo "should_dispatch=$should_dispatch" >> "$GITHUB_OUTPUT"
