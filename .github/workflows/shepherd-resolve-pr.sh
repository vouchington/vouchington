#!/usr/bin/env bash
set -euo pipefail

echo "should_dispatch=false" >> "$GITHUB_OUTPUT"

PR_JSON="$(gh api "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER")"
HEAD_REPO="$(echo "$PR_JSON" | jq -r '.head.repo.full_name')"
PR_TITLE="$(echo "$PR_JSON" | jq -r '.title')"
PR_URL="$(echo "$PR_JSON" | jq -r '.html_url')"
PR_HEAD_REF="$(echo "$PR_JSON" | jq -r '.head.ref')"
PR_HEAD_SHA="$(echo "$PR_JSON" | jq -r '.head.sha')"

if [[ "$HEAD_REPO" != "$GITHUB_REPOSITORY" ]]; then
  gh issue comment "$PR_NUMBER" \
    --repo "$GITHUB_REPOSITORY" \
    --body "Cannot run \`/shepherd\` on fork PRs because automation may update the pull request branch."
  echo "Skipping fork PR #$PR_NUMBER from $HEAD_REPO."
  exit 0
fi

{
  echo "pr_number=$PR_NUMBER"
  echo "pr_url=$PR_URL"
  echo "pr_head_ref=$PR_HEAD_REF"
  echo "pr_head_sha=$PR_HEAD_SHA"
} >> "$GITHUB_OUTPUT"
printf '%s' "$PR_TITLE" | \
  "$GITHUB_WORKSPACE/ci/write-github-multiline-output.sh" pr_title
echo "should_dispatch=true" >> "$GITHUB_OUTPUT"
