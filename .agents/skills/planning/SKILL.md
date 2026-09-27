---
name: planning
description: Create evidence-backed Vouchington implementation plans. Loads the portable Vouchington planning workflow, then applies local Plan issue and validation policy.
---

# Vouchington Planning Adapter

## Canonical skill (required)

Use `vouchington-workflow:planning` when the runtime provides it; otherwise read the installed canonical `node_modules/vouchington-tooling/skills/planning/SKILL.md` and resolve its supporting resources relative to that directory. If the canonical skill cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

The runtime chooses its available agents; if an independent reviewer cannot run, obtain human acceptance before treating the Plan as final.

## Vouchington additions

Before choosing a design, record the applicable local constraints and their concrete consequences
in the Plan's implementation steps. In particular, establish launch/deployment state from
[`AGENTS.md`](../../../AGENTS.md), not from the presence of deployment infrastructure. A conditional
live-deployment exception is not evidence that it applies. Voucha is not live: plan one current
contract, delete the path it replaces, and omit compatibility readers, activation switches,
nullable transition fields, backfills, and rollout plans. The portable planning step that asks for
a rollout does not apply here.

For database work, read [`backend/data-stores/psql/AGENTS.md`](../../../backend/data-stores/psql/AGENTS.md)
before selecting column shapes. Trace each identifier's readers and joins; record what it denotes,
its concrete relationship, foreign-key coverage, constraint, and deletion behavior. Check generic `kind`/type plus ID designs against the owning
schema rules even when they resemble existing code or have TypeScript unions and SQL `CHECK`s.
If historical identity retention conflicts with foreign-key deletion semantics, resolve that
choice with the human before implementing an exception; do not silently reinterpret the rule.

Classify every JSON field and reference by ownership; plan concrete live or entity-specific
retained identity FKs for internal relations. See
[prelaunch relational storage](../../../docs/development/postgres-schema-rules.md#prelaunch-relational-storage).

Read [impact discovery](references/impact-discovery.md) and [live-browser preflight](references/live-browser-preflight.md).
Use the exact local [Plan template](references/plan-template.md), then run
`node dev/plan-issue.mts validate --title "Plan: …" --body-file <file>` so every
repository-owned verification command resolves in the current worktree. Create validated Plan
issues through the [GitHub issue workflow](../github-issue/SKILL.md), including local taxonomy,
project or milestone selection, and post-create verification.
