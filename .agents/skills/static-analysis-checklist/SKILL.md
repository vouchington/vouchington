---
name: static-analysis-checklist
description: Use when changing a Filaments static-analysis rule, configuration, fixture corpus, suppression, allowlist, or repository guard.
---

# Filaments Static Analysis Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:static-analysis-checklist`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/static-analysis-checklist/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Filaments additions

Treat [`static-code-analysis/README.md`](../../../static-code-analysis/README.md) as canonical.
Read its rule-placement, guard-authoring, migration-cleanup, and rollout sections before choosing
an implementation. Add positive and negative fixtures, run the focused fixture test and scanner,
then the owning aggregate check. For participating invariants, run `pnpm run no-mistakes` and
`pnpm run repo-file-policy`; update the inventory and remove superseded migration artifacts only
after the replacement covers the invariant.
