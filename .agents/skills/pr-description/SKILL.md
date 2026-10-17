---
name: pr-description
description: Draft, validate, or update a Vouchington PR description.
---

# Vouchington PR Description Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:pr-description`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/pr-description/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Vouchington additions

Use the `pr_create`, `pr_update`, and `pr_validate` tools of the `vouchington-tooling` MCP server
rather than raw `gh pr create` or `gh pr edit --body*`, which the Codex hook blocks. The tools take
the structured `title`, `summary`, `impact`, `relatedIssues`, `details`, `agent`, and
`workspaceSetup` input (the server derives the trusted `mode` from its launch environment) and
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
the trusted runtime is automation. The only other accepted reason is `scheduled prompt run`, for
scheduled prompts. Existing
scheduled-prompt and Fix Main exceptions keep their own representations and authority limits.
