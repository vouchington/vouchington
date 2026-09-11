# Plan Issue Helper

[Back to Dev Environment Reference](README.md#plan-issue-helper)

Use `node dev/plan-issue.mts validate|create --title <title> --body-file <path> [--label <label>] [--repo <owner/repo>]`.
It accepts only reviewed body files and validates the exact shared planning-skill H2 schema, matching
`## Solves` issue reference and GitHub source URL (or exact direct-user-request source), structured
evidence, required `## Live browser preflight` status and status-specific fields, Mermaid/table or
justified non-applicability comparison, and code-formatted verification commands. Repository-owned
`pnpm run` scripts, Vitest `--project`/`--config` references, and repo-relative executables in
`## Verification steps` must resolve in the current worktree; third-party CLIs are not grammar-checked,
new test-file arguments may not exist yet, and `pnpm --filter` skips package-script lookup because
filter selectors are not repository paths. See the
[planning skill](../.agents/skills/planning/SKILL.md) for the canonical template.
The helper rejects structural errors before network access, resolves an omitted target with
`gh repo view`, then binds unqualified issue references to that repository before creation. It
deduplicates the required `plan` label.
It also rejects bodies above GitHub's upstream-defined body limit before parser or GitHub work,
reporting the Unicode-character count, UTF-8 byte count, and shared maximum. It preserves the input
exactly without truncating, normalizing, or compacting it automatically. Save the complete body and
preserve required content; move supporting detail to a linked issue or attachment, remove duplicate
prose, or compact only harmless Markdown whitespace before retrying.
Live-browser fields are parsed from Markdown list items; fenced examples and HTML comments do not
satisfy the contract. For `create`, `--repo <owner/repo>` passes the explicit target repository to
`gh issue create`; omit it to use the repository resolved by `gh`. `validate` accepts the same
option so one reviewed invocation can be changed from validation to creation without changing its
target arguments, but performs no GitHub mutation.
The raw `gh issue create` hook requires `Plan:` titles to use the helper so the asynchronous Mermaid
parser and effective-repository identity check cannot be bypassed.
