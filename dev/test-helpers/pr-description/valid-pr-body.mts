/** Canonical provenance lines for fixture bodies — a fixed device/worktree, harness-free. */
export const VALID_PROVENANCE_LINES = [
  'Agent: human',
  'Device: test@test-host',
  'Worktree: test-worktree',
]

/** Joined block for splicing into a fixture's `Workspace setup:` line via template interpolation. */
export const VALID_PROVENANCE_BLOCK = VALID_PROVENANCE_LINES.join('\n')

/** Canonical minimal valid PR body. */
export const VALID_PR_BODY = `## Summary

Brief summary.

## Impact

Developers get actionable PR descriptions; product behavior is unchanged.

## Related issues

Closes #123

Workspace setup: ./dev/initialize monorepo
${VALID_PROVENANCE_BLOCK}
`

/** Canonical Fix Main interim-classifier no-closing-ref PR body (see scheduled-no-source.mts). */
export const VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY = `## Summary

Interim transient-retry classifier for a not-yet-durably-classified CI failure.

## Impact

CI operators can retry the narrowly classified failure while its root cause remains tracked.

## Related issues

Refs #456
No closing reference; root-cause issue tracked via the Refs entry above.
<!-- related-issues-validation: no-closing-ref-fix-main-interim-classifier -->

Workspace setup: Automation fix-main run
${VALID_PROVENANCE_BLOCK}
`
