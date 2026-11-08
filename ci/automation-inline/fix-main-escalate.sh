WORKFLOW_NAME="$FAILED_WORKFLOW_NAME"
RUN_URL="$FAILED_RUN_URL"
COMMIT_SHA="$FAILED_COMMIT_SHA"
THIS_RUN_URL="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"

if [[ "$RENDER_PROMPT_RESULT" == "failure" || "$RENDER_PROMPT_RESULT" == "cancelled" ]]; then
  FAILED_JOB="render-prompt ($RENDER_PROMPT_RESULT)"
elif [[ "$DISPATCH_RESULT" == "failure" || "$DISPATCH_RESULT" == "cancelled" ]]; then
  FAILED_JOB="dispatch ($DISPATCH_RESULT)"
else
  FAILED_JOB="unknown (unexpected escalation trigger)"
fi

TITLE="Automation fix: $WORKFLOW_NAME @ $COMMIT_SHA — needs human"

EXISTING="$(gh issue list \
  --repo "$GITHUB_REPOSITORY" \
  --search "\"$TITLE\" in:title" \
  --state open \
  --json number \
  -q '.[0].number' || true)"

SESSION_LINE=""
if [[ -n "$SESSION_ID" ]]; then
  SESSION_LINE="**Harness session:** $SESSION_ID"$'\n'
fi

BODY="$(cat <<EOF
## $WORKFLOW_NAME failed on main — auto-fix could not be dispatched

**Failing run:** $RUN_URL
**Failing commit:** $COMMIT_SHA
**Failed job:** $FAILED_JOB
${SESSION_LINE}**Auto-fix run (logs/artifact):** $THIS_RUN_URL

Please investigate and apply a fix manually.
EOF
)"

if [[ "$EXISTING" =~ ^[0-9]+$ ]]; then
  echo "Commenting on existing issue #$EXISTING"
  gh issue comment "$EXISTING" --repo "$GITHUB_REPOSITORY" --body "$BODY"
else
  echo "Opening new issue: $TITLE"
  gh issue create \
    --repo "$GITHUB_REPOSITORY" \
    --title "$TITLE" \
    --body "$BODY" \
    --label "automation" \
    --label "needs-human"
fi
