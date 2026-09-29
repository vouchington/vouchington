---
name: planning
description: Plan Vouchington changes with evidence and a proportional durable record.
---

# Vouchington Planning Adapter

## Canonical skill (required)

Use `vouchington-workflow:planning` when the runtime provides it; otherwise read the installed canonical `node_modules/vouchington-tooling/skills/planning/SKILL.md` and resolve its supporting resources relative to that directory. If the canonical skill cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

Scale planning and independent review to the scope, uncertainty, and risk of the change.

## Vouchington additions

Before choosing a design, record the applicable local constraints and their concrete consequences
in the Plan's implementation steps. In particular, establish launch/deployment state from
[`AGENTS.md`](../../../AGENTS.md), not from the presence of deployment infrastructure. A conditional
live-deployment exception is not evidence that it applies. Follow
[One current contract](../../../AGENTS.md): plan the current prelaunch contract without a product
rollout or compatibility path.

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

Save the accepted plan once outside Git: use an existing issue or comment, the PR description,
or a native plan file whose persistent path you have verified. A new `Plan:` issue is optional;
create one only when useful and authorized through [github-issue](../github-issue/SKILL.md).
Keep later material decisions in that same record, with what changed and why. Do not create a
second artifact to satisfy a format, and do not commit plans. A small change may need only a few
sentences; a cross-cutting change needs evidence, affected owners, decisions, steps, and validation.

For structural code changes, use [impact discovery](references/impact-discovery.md) to identify
readers, consumers, and tests. For work requiring live visual QA, use
[live-browser preflight](references/live-browser-preflight.md). Verify planned repository commands
and existing paths against the current worktree; distinguish proposed paths from existing ones.
