set -euo pipefail

THIS_RUN_URL="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"

# Keyed on the Fix Main run id alone (not id+attempt): gh run rerun keeps the same run
# id across attempts, so every watcher invocation for the same underlying incident
# converges on one issue via the search-then-comment below instead of filing a new one
# each time this watcher itself has trouble.
TITLE="Fix Main self-retry incomplete: run $FIX_MAIN_RUN_ID — needs human"

EXISTING="$(gh issue list \
  --repo "$GITHUB_REPOSITORY" \
  --search "\"$TITLE\" in:title" \
  --state open \
  --json number \
  -q '.[0].number' || true)"

BODY="$(cat <<EOF
## Fix Main failure handling could not be confirmed

The watcher could not confirm any safe terminal outcome for the Fix Main failure (attempt $FIX_MAIN_RUN_ATTEMPT):
the original run did not have a confirmed human escalation, the source was not confirmed
superseded, and no rerun request was confirmed accepted.

**Fix Main run:** $FIX_MAIN_RUN_URL
**Watcher run (logs/artifact):** $THIS_RUN_URL

Please inspect the Fix Main run above and apply a fix manually.
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
