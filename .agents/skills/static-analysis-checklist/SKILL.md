---
name: static-analysis-checklist
description: Change Vouchington analyzer guards in static-code-analysis/, ast-grep-rules/, or no-mistakes and oxlint configuration.
---

# Vouchington Static Analysis Adapter

## Canonical skill (required)

Claude Code, Codex, and Grok load the plugin skill `skills:static-analysis-checklist`. If it cannot be loaded, stop and report the missing prerequisite; never apply this adapter alone.

## Vouchington additions

Use this checklist when changing analyzer enforcement in `static-code-analysis/`, `ast-grep-rules/`,
or `no-mistakes`/oxlint configuration. Agent permission and hook configuration belongs to
[agent harness parity](../../../docs/development/agent-harness-parity.md); load this checklist only
when the same change also changes analyzer enforcement.
Treat [`static-code-analysis/README.md`](../../../docs/development/quality/static-code-analysis/README.md) as canonical.
Read its rule-placement, guard-authoring, migration-cleanup, and rollout sections before choosing
an implementation. When `no-mistakes` cannot read a dynamic SQL builder, extend its bounded evaluator or add the
library's semantics upstream; never duplicate whole statements or add trust declarations.
Add positive and negative fixtures, run the focused fixture test and scanner,
then the owning aggregate check. For participating invariants, run `pnpm run no-mistakes` and
`pnpm run repo-file-policy`; update the inventory and remove superseded migration artifacts only
after the replacement covers the invariant.
