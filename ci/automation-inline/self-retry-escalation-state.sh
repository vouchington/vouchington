set -euo pipefail
# Ground truth for "did a human already get notified for this Fix Main run", independent
# of anything decide.mts concludes here. Scoped to the attempt that just completed — the
# unscoped /jobs endpoint returns the latest attempt, which normally is the same thing,
# but attempt-scoping removes any doubt if a later attempt starts before this step runs.
conclusion="$(
  gh api "repos/$GITHUB_REPOSITORY/actions/runs/$SOURCE_RUN_ID/attempts/$SOURCE_RUN_ATTEMPT/jobs?per_page=100" \
    --jq '[.jobs[] | select(.name == "Escalate to human")][0].conclusion // "not-found"'
)"
echo "conclusion=$conclusion" >> "$GITHUB_OUTPUT"
