---
name: static-analysis-checklist
description: Change Vouchington analyzer guards in static-code-analysis/, ast-grep-rules/, or no-mistakes and oxlint configuration.
---

# Vouchington Static Analysis Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:static-analysis-checklist`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/static-analysis-checklist/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Vouchington additions

Use this checklist when changing analyzer enforcement in `static-code-analysis/`, `ast-grep-rules/`,
or `no-mistakes`/oxlint configuration. Agent permission and hook configuration belongs to
[`dev/codex-hooks/AGENTS.md`](../../../dev/codex-hooks/AGENTS.md); load this checklist only when the
same change also changes analyzer enforcement.
Treat [`static-code-analysis/README.md`](../../../docs/development/quality/static-code-analysis/README.md) as canonical.
Read its rule-placement, guard-authoring, migration-cleanup, and rollout sections before choosing
an implementation. Add positive and negative fixtures, run the focused fixture test and scanner,
then the owning aggregate check. For participating invariants, run `pnpm run no-mistakes` and
`pnpm run repo-file-policy`; update the inventory and remove superseded migration artifacts only
after the replacement covers the invariant.
