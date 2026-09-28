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
live-deployment exception is not evidence that it applies. Follow
[One current contract](../../../AGENTS.md). The portable planning step that asks for a rollout
does not apply here.

For database work, read [`backend/data-stores/psql/AGENTS.md`](../../../backend/data-stores/psql/AGENTS.md)
before selecting column shapes. Trace each identifier's readers and joins; record what it denotes,
its concrete relationship, foreign-key coverage, constraint, and deletion behavior. Check generic `kind`/type plus ID designs against the owning
schema rules even when they resemble existing code or have TypeScript unions and SQL `CHECK`s.
Change history is not a foreign key. Do not add one so a history document can be joined. A
retained-identity row is separate: a durable record can reference the entity after the live row is
gone, and the identity does not authorize that entity.

Plan a foreign key for an id or a UUID array that a query joins. Leave structured documents and
change history as JSON. A data point stays JSON except for an entity id inside it, such as a topic
id. See
[prelaunch relational storage](../../../docs/development/postgres-schema-rules.md#prelaunch-relational-storage).

Read [impact discovery](references/impact-discovery.md) and [live-browser preflight](references/live-browser-preflight.md).
Use the exact local [Plan template](references/plan-template.md), then run
`node dev/plan-issue.mts validate --title "Plan: …" --body-file <file>` so every
repository-owned verification command resolves in the current worktree. Create validated Plan
issues through the [GitHub issue workflow](../github-issue/SKILL.md), including local taxonomy,
project or milestone selection, and post-create verification.
