---
name: pr-description
description: Use when drafting or updating a Filaments PR description. Loads the portable Vouchington PR-description workflow, then applies local helper and policy requirements.
---

# Filaments PR Description Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:pr-description`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/pr-description/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Filaments additions

Use `node dev/pr-description.mts create --title <title> --body-file <file>` and
`node dev/pr-description.mts update <pr> --body-file <file>` rather than raw body mutation. The
local validator enforces `## Related issues`, `Workspace setup:`, and tool-injected `Agent:`,
`Device:`, and `Worktree:` provenance lines. It also requires a Mermaid diagram when it clarifies
the change and performs issue-supersession and milestone-completion audits.

For Filaments descriptions, retain the portable checklist's **Summary**, root cause, rollout / follow-ups,
deploy-safety, linked-issue context, and Mermaid guidance. Local PR mechanics, Shepherd Journal
preservation, validation, and merge authority live in [git-and-prs.md](../agent-workflow/git-and-prs.md).
