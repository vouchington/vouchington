set -euo pipefail
# harness-dispatch.yml serializes per PR+sha with cancel-in-progress: false, and GitHub keeps
# only one pending run per concurrency group, so it cancels the other pending dispatch jobs.
# A coalesced job is cancelled with zero steps; a real timeout-minutes cancellation would have
# executed steps. The surviving run owns the Harness session, so this run must stay quiet.
# Fail open: if the jobs lookup fails, post the comment.
if [[ "$DISPATCH_RESULT" == "cancelled" && -z "$SESSION_ID" ]]; then
  if coalesced="$(
    gh api "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/jobs?per_page=100" --jq \
      '[.jobs[] | select(.name | startswith("Harness dispatch"))]
       | (length > 0) and all(.conclusion == "cancelled" and ((.steps // []) | length) == 0)'
  )" && [[ "$coalesced" == "true" ]]; then
    echo "::notice::Dispatch was cancelled by concurrency coalescing before running any step; another run owns the Harness session. Suppressing failure comment."
    exit 0
  fi
fi

if ! gh api "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER" --jq \
  'select(.state == "open" and .user.login == "dependabot[bot]" and .head.ref == env.HEAD_BRANCH and .head.sha == env.EVENT_HEAD_SHA) | .head.sha' \
  | grep -qx "$EVENT_HEAD_SHA"; then
  echo "Suppressing failure comment because the Dependabot PR is no longer the validated source head."
  exit 0
fi

echo "post=true" >> "$GITHUB_OUTPUT"
