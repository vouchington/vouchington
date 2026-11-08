echo "Upstream workflow: $WORKFLOW_NAME"
echo "Conclusion:        $CONCLUSION"
echo "Run attempt:       $RUN_ATTEMPT"
echo "Run URL:           $HTML_URL"
echo "Dependabot branch: $HEAD_BRANCH"
echo "PR number:         ${PR_NUMBER:-<not found>}"

echo "pr_number=$PR_NUMBER" >> "$GITHUB_OUTPUT"

if [[ "$SOURCE_STATE_CURRENT" != "true" ]]; then
  echo "::notice::Source workflow run is stale; skipping transient classification and Auto Harness dispatch."
  echo "should_dispatch=false" >> "$GITHUB_OUTPUT"
  exit 0
fi

if [[ -z "$PR_NUMBER" ]]; then
  echo "::warning::Workflow run payload did not include a pull request number; skipping automation."
  echo "should_dispatch=false" >> "$GITHUB_OUTPUT"
  exit 0
fi

should_dispatch=false

if [[ "$TRANSIENT_DECISION" == "rerun" ]]; then
  echo "Transient retry rule matched: $MATCHED_RULE — rerun already requested."
elif [[ "$TRANSIENT_DECISION" == "ignore" ]]; then
  echo "Transient retry rule chose ignore; skipping automation."
elif [[ "$CONCLUSION" == "timed_out" || "$CONCLUSION" == "cancelled" ]]; then
  if [[ "$RUN_ATTEMPT" -eq 1 ]]; then
    echo "Uncatalogued $CONCLUSION on attempt 1 — rerunning once."
    node ci/revalidate-dependabot-rerun.mts
    echo "should_dispatch=false" >> "$GITHUB_OUTPUT"
    exit 0
  else
    echo "Already retried (attempt $RUN_ATTEMPT) and still $CONCLUSION — dispatching Auto Harness."
    should_dispatch=true
  fi
else
  echo "Hard failure — dispatching Auto Harness."
  should_dispatch=true
fi

if [[ "$should_dispatch" == "true" ]]; then
  # The dispatch job intentionally checks out the live dependabot/* branch tip, not
  # the commit this event actually tested. Re-validate the PR is still at the SHA this
  # event fired for, so a stale
  # event superseded by a Dependabot rebase can't dispatch Auto Harness with a prompt
  # describing an already-moot failure. Compare the live headRefOid to the triggering SHA.
  CURRENT_HEAD_SHA="$(gh pr view "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --json headRefOid --jq '.headRefOid')"
  if [[ "$CURRENT_HEAD_SHA" != "$EVENT_HEAD_SHA" ]]; then
    echo "Skipping automation: PR #$PR_NUMBER moved from $EVENT_HEAD_SHA to $CURRENT_HEAD_SHA since this CI run started (Dependabot rebase). The rebased tip's own CI run will trigger its own triage if it still fails."
    should_dispatch=false
  fi
fi

echo "should_dispatch=$should_dispatch" >> "$GITHUB_OUTPUT"
