#!/usr/bin/env bash
set -euo pipefail
gh api "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER" --jq \
  'select(.state == "open" and .head.repo.full_name == env.GITHUB_REPOSITORY and .head.ref == env.PR_HEAD_REF and .head.sha == env.PR_HEAD_SHA) | .number' \
  | grep -qx "$PR_NUMBER"
gh api "repos/$GITHUB_REPOSITORY/issues/comments/$CHECKPOINT_COMMENT_ID" > "$RUNNER_TEMP/checkpoint-comment.json"
BODY="$(node ci/shepherd-checkpoint-cli.mts update "$RUNNER_TEMP/checkpoint-comment.json")"
gh api -X PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$CHECKPOINT_COMMENT_ID" -f body="$BODY" > /dev/null
