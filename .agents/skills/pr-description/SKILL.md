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
local validator requires exactly one visible, nonempty `## Summary` and `## Impact`, plus
`## Related issues`, `Workspace setup:`, and tool-injected `Agent:`, `Device:`, and `Worktree:`
provenance lines. It rejects malformed details containers and performs issue-supersession,
milestone-completion, and project-completion audits. Diagram usefulness and factual claims require
review; the validator does not enforce Mermaid or judge prose quality.

Apply the portable description standard: explain the concrete before/after and reason in Summary,
and affected users, staff, developers, or operators and material consequences in Impact. Use tables
and Mermaid when they clarify a comparison or nontrivial workflow. Keep material conclusions and
risks visible; put long evidence and supporting diagrams inside `<details>`. Do not require a Test
plan section or list routine successful local checks. Follow the portable conditional Harness gaps
policy after CI diagnosis and retain established gaps after checks turn green.

For schema changes, identify added and removed tables, columns, foreign keys, constraints, deletion
and retention behavior, and coordinated producers and consumers. Explain alignment with the
[prelaunch relational storage policy](../../../docs/development/postgres-schema-rules.md#prelaunch-relational-storage)
and [schema instructions](../../../backend/data-stores/psql/AGENTS.md). Follow
[One current contract](../../../AGENTS.md): rewrite the canonical schema and current consumers;
do not invent compatibility paths, backfills, activation flags, or a product rollout narrative.
Local PR mechanics, Shepherd Journal preservation, validation, and merge authority live in
[git-and-prs.md](../agent-workflow/git-and-prs.md).
For a multi-PR `Plan:`, keep the Plan as the sibling ledger; non-completing PRs carry only their
ordinal and a `Refs #Plan` explanation, while the completing PR uses `Closes #Plan`. The main-push
completion advisory is not an automatic Plan closure.
