---
name: pr-description
description: Draft, validate, or update a Vouchington PR description.
---

# Vouchington PR Description Adapter

## Canonical skill (required)

Claude Code, Codex, and Grok load the plugin skill `skills:pr-description` for the writing rules, and `vouchington-workflow:pr-description` for the `pr_create`, `pr_update`, and `pr_validate` MCP tools. If either cannot be loaded, stop and report the missing prerequisite; never apply this adapter alone.

## Vouchington additions

Use the `pr_create`, `pr_update`, and `pr_validate` tools of the `vouchington-tooling` MCP server
for PR creation and body updates. They validate the content and provenance and preserve the
Shepherd Journal; raw `gh pr create` and `gh pr edit --body*` commands skip that validation. The tools take
the structured `title`, `summary`, `impact`, `relatedIssues`, `details`, and `workspaceSetup`
input (the server derives the trusted `mode` and the `Agent:` line from its own environment; omit
`agent` and `model`) and
render the H2 body themselves, so put no `##` headings or provenance
lines in those fields. `details` entries may use `###` headings where a workflow names required
sections (for example `### Root cause`, `### Implementation choice`, `### Options considered`).
When the branch diff exceeds the split thresholds, `pr_create` fails unless `details` has a
`### Large diff` entry explaining why the change stays whole. `pr_create` adds the milestone and project of the related issues. The checkout policy
([`dev/agent-policy.mts`](../../../dev/agent-policy.mts)) enforces exactly one visible `## Summary` and `## Impact`, `## Related issues`, `Workspace setup:`, and tool-injected `Agent:`,
`Device:`, and `Worktree:` provenance lines. It performs issue-supersession, milestone-completion, and project-completion audits. Include a
Mermaid diagram when it helps reviewers understand the change; that is description guidance.

For Vouchington descriptions, retain the portable checklist's **Summary**, root cause, follow-ups,
linked-issue context, and Mermaid guidance. Omit a product rollout narrative; follow
[One current contract](../../../AGENTS.md). Local PR mechanics, Shepherd
Journal preservation, validation, and merge authority live in [git-and-prs.md](../agent-workflow/git-and-prs.md).
When the chosen plan record is a multi-PR `Plan:` issue, keep it as the sibling ledger; non-completing PRs carry only their
ordinal and a `Refs #Plan` explanation, while the completing PR uses `Closes #Plan`. The main-push
completion advisory is not an automatic Plan closure.

For an interactive change explicitly requested by the user with no source issue, pass an empty
`relatedIssues` and `noSourceIssue: { reason: "direct user request" }`; the policy's
`renderNoSourceIssue` export renders this exact pair in `## Related issues`:

```markdown
No source issue; direct user request.
<!-- related-issues-validation: no-source-direct-request -->
```

Use it only when that description is truthful. It requires no plan heading and is rejected when
the trusted runtime is automation. The other accepted reasons are `scheduled prompt run`, for
scheduled prompts, and `partial batch`, for the
partial-batch representation,
whose single `refs` entry names the open source issue. A `relatedIssues` entry for another
repository adds `repository: "owner/name"`.
