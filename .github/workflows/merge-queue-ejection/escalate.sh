#!/usr/bin/env bash
set -euo pipefail
# Every ejection shares one concurrency id, so harness-dispatch.yml serializes them with
# cancel-in-progress: false, and GitHub keeps only one pending run per concurrency group: it
# cancels the other pending dispatch jobs. A coalesced job is cancelled with zero steps; a
# real timeout-minutes cancellation would have executed steps. The surviving run belongs to
# another PR, so this PR gets no session link: post a notice instead of a failure. It must
# not contain the triage marker, or discovery would treat this ejection as triaged. Fail
# open: if the jobs lookup fails, post the failure comment.
if [[ "$DISPATCH_RESULT" == "cancelled" && -z "$SESSION_ID" ]]; then
  if coalesced="$(
    gh api "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/jobs?per_page=100" --jq \
      '[.jobs[] | select(.name | startswith("Harness dispatch"))]
       | (length > 0) and all(.conclusion == "cancelled" and ((.steps // []) | length) == 0)'
  )" && [[ "$coalesced" == "true" ]]; then
    echo "::notice::Dispatch was cancelled by concurrency coalescing before running any step; posting a coalesced notice instead of a failure comment."
    gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --body "The merge queue removed this PR (\`$REASON\`). GitHub coalesced its triage request with another ejection's, so the shared triage session sweeps this PR unless that session already finished its last pass. Any triage session that starts within a day also sweeps it.

**Triage run:** $THIS_RUN_URL

Until a triage comment appears, inspect the failed merge-group run before re-enqueueing."
    exit 0
  fi
fi

BODY="The merge queue removed this PR (\`$REASON\`), and automated triage could not start.

**Triage run:** $THIS_RUN_URL"
if [[ -n "$SESSION_ID" ]]; then
  BODY="$BODY
**Harness session:** $SESSION_ID"
fi
BODY="$BODY

If another ejection starts triage within a day, that session also sweeps this PR. Until then, inspect the failed merge-group run before re-enqueueing."
gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --body "$BODY"
