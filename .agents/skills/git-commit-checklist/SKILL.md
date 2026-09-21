---
name: git-commit-checklist
description: Use before staging or committing in Vouchington. Loads the portable Vouchington checklist, then applies Vouchington validation and hook policy.
---

# Vouchington Git Commit Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:git-commit-checklist`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/git-commit-checklist/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Vouchington additions

Follow [the commit checklist](../../../docs/checklists/commit.md) for this repository's command
details, file-size budgets, commit-message format, and hook policy. For manifest changes, also
load [package-json-checklist](../package-json-checklist/SKILL.md). Before the first push, use
[Before Pushing](../agent-workflow/before-pushing.md). Run a newly added `*.test.mts` directly with
`pnpm exec vitest run <changed-test-file>`; CI runs the complete `no-mistakes` gate.
