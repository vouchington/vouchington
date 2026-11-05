#!/usr/bin/env bash
if [[ "$EVENT_NAME" == pull_request || "$EVENT_NAME" == merge_group ]]; then
  # A pull request compares its own layer (HEAD^1, the synthetic-merge parent); a merge
  # group compares the combined base and head.
  range=HEAD^1
  if [[ "$EVENT_NAME" == merge_group ]]; then
    git fetch --no-tags --depth=1 origin "$BASE_SHA"
    range="$BASE_SHA"
  fi
  if git diff --quiet "$range" HEAD -- pnpm-lock.yaml pnpm-workspace.yaml static-code-analysis/dependency-license-policy; then
    echo 'skipped: no dependency input changed'
    exit 0
  fi
fi
pnpm run dependency-license-policy
