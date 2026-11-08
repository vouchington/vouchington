set -euo pipefail
gh api "repos/$GITHUB_REPOSITORY/issues/$ISSUE_NUMBER" --jq \
  'select(.state == "open") | .number' | grep -qx "$ISSUE_NUMBER"
COMMENT_JSON="$(gh api "repos/$GITHUB_REPOSITORY/issues/comments/$TRIGGER_COMMENT_ID")"
COMMAND="$(jq -r '.body | split("\n")[0]' <<< "$COMMENT_JSON" | tr -d '\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
if [[ "$COMMAND" != "/fix" ]]; then
  echo "Suppressing failure comment because the triggering /fix command is no longer valid."
  exit 0
fi
echo "valid=true" >> "$GITHUB_OUTPUT"
