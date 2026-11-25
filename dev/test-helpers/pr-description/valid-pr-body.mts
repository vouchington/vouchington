/** Canonical provenance lines for fixture bodies — a fixed device/worktree, harness-free. */
const VALID_PROVENANCE_LINES = ['Agent: human', 'Device: test@test-host', 'Worktree: test-worktree']

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
