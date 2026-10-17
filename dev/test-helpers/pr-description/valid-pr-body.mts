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

/** Canonical partial-batch PR body as pr_create renders it (see partial-batch.mts). */
export const VALID_PARTIAL_BATCH_BODY = `## Summary

First batch of a larger source issue.

## Impact

Developers receive the first batch while the rest of the source issue stays tracked.

## Related issues

- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->

Workspace setup: ./dev/initialize monorepo
${VALID_PROVENANCE_BLOCK}
`
