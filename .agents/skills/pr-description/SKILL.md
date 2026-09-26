---
name: pr-description
description: Use when drafting or updating a Vouchington PR description. Loads the portable Vouchington PR-description workflow, then applies local helper and policy requirements.
---

# Vouchington PR Description Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:pr-description`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/pr-description/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Vouchington additions

Use `node dev/pr-description.mts create --title <title> --body-file <file>` and
`node dev/pr-description.mts update <pr> --body-file <file>` rather than raw body mutation. The
local validator enforces `## Related issues`, `Workspace setup:`, and tool-injected `Agent:`,
`Device:`, and `Worktree:` provenance lines. It also requires a Mermaid diagram when it clarifies
the change and performs issue-supersession, milestone-completion, and project-completion audits.

For Vouchington descriptions, retain the portable checklist's **Summary**, root cause, rollout / follow-ups,
deploy-safety, linked-issue context, and Mermaid guidance. Local PR mechanics, Shepherd Journal
preservation, validation, and merge authority live in [git-and-prs.md](../agent-workflow/git-and-prs.md).
For a multi-PR `Plan:`, keep the Plan as the sibling ledger; non-completing PRs carry only their
ordinal and a `Refs #Plan` explanation, while the completing PR uses `Closes #Plan`. The main-push
completion advisory is not an automatic Plan closure.
