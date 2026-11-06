#!/usr/bin/env bash
set -euo pipefail
CHECKPOINT_ACTOR="github-actions[bot]"
export CHECKPOINT_ACTOR PR_NUMBER="$ISSUE_NUMBER"
gh api --paginate "repos/$GITHUB_REPOSITORY/issues/$ISSUE_NUMBER/comments?per_page=100" \
  | jq -s 'add' > "$RUNNER_TEMP/pr-shepherd-comments.json"
if ! SELECTION="$(node ci/shepherd-checkpoint-cli.mts select \
  "$RUNNER_TEMP/pr-shepherd-comments.json" \
  2>"$RUNNER_TEMP/pr-shepherd-resume-error.txt")"; then
  gh issue comment "$ISSUE_NUMBER" \
    --repo "$GITHUB_REPOSITORY" \
    --body "Cannot safely resume the previous Harness shepherd session because its local transcript failed checkpoint validation. [Inspect this workflow run]($RUN_URL), then retry after correcting or removing the corrupt local session."
  cat "$RUNNER_TEMP/pr-shepherd-resume-error.txt" >&2
  exit 1
fi
RESUME_SESSION_ID="$(printf '%s' "$SELECTION" | jq -r '.sessionId // empty')"
SESSION_START_SHA="$(printf '%s' "$SELECTION" | jq -r '.sessionStartSha // empty')"
RESUME_SOURCE_RUN_ID="$(printf '%s' "$SELECTION" | jq -r '.runId // empty')"
if [[ -z "$SESSION_START_SHA" ]]; then
  SESSION_START_SHA="$PR_HEAD_SHA"
fi
CREATED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

jq -n \
  --arg marker "shepherd-checkpoint:v1" \
  --arg repository "$GITHUB_REPOSITORY" \
  --argjson pr "$ISSUE_NUMBER" \
  --argjson triggerCommentId "$TRIGGER_COMMENT_ID" \
  --arg headRef "$PR_HEAD_REF" \
  --arg startSha "$PR_HEAD_SHA" \
  --arg sessionStartSha "$SESSION_START_SHA" \
  --arg runId "$CHECKPOINT_RUN_ID" \
  --arg runUrl "$RUN_URL" \
  --arg actor "$CHECKPOINT_ACTOR" \
  --arg sessionId "$RESUME_SESSION_ID" \
  --arg resumeSourceRunId "$RESUME_SOURCE_RUN_ID" \
  --arg status "queued" \
  --arg createdAt "$CREATED_AT" \
  --arg updatedAt "$CREATED_AT" \
  '{marker: $marker, repository: $repository, pr: $pr,
    triggerCommentId: $triggerCommentId, headRef: $headRef,
    startSha: $startSha, sessionStartSha: $sessionStartSha, runId: $runId,
    runUrl: $runUrl, actor: $actor, sessionId: $sessionId,
    resumeSourceRunId: $resumeSourceRunId, status: $status,
    createdAt: $createdAt, updatedAt: $updatedAt}' \
  > "$RUNNER_TEMP/pr-shepherd-checkpoint.json"
BODY="$(node ci/shepherd-checkpoint-cli.mts render \
  "$RUNNER_TEMP/pr-shepherd-checkpoint.json")"
COMMENT_JSON="$(gh api -X POST "repos/$GITHUB_REPOSITORY/issues/$ISSUE_NUMBER/comments" \
  -f body="$BODY")"
printf '%s' "$COMMENT_JSON" | jq -e \
  '.user.login == "github-actions[bot]" and
   .user.type == "Bot" and
   .performed_via_github_app.slug == "github-actions"' > /dev/null
CHECKPOINT_COMMENT_ID="$(printf '%s' "$COMMENT_JSON" | jq -er '.id | select(type == "number" and . > 0)')"

echo "resume_session_id=$RESUME_SESSION_ID" >> "$GITHUB_OUTPUT"
echo "checkpoint_comment_id=$CHECKPOINT_COMMENT_ID" >> "$GITHUB_OUTPUT"
