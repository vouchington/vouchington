set -euo pipefail
gh api "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER" --jq \
  'select(.state == "open" and .user.login == "dependabot[bot]" and .head.ref == env.HEAD_BRANCH and .head.sha == env.EVENT_HEAD_SHA) | .head.sha' \
  | grep -qx "$EVENT_HEAD_SHA"
echo 'current=true' >> "$GITHUB_OUTPUT"
