---
name: agent-workflow
description: Apply Voucha workflow constraints when planning, implementing, reviewing, or publishing repository changes.
---

# Vouchington workflow

## Canonical skill (required)

Load `vouchington-workflow:agent-workflow`, or
`node_modules/vouchington-tooling/skills/agent-workflow/SKILL.md` when the plugin is unavailable.
If neither canonical source is readable, report the missing prerequisite; do not apply this overlay alone.
Apply these local additions after the canonical skill. Resolve references relative to their owner;
do not reload a canonical skill or adapter already read in this task.

## Local constraints

- Read the target files' complete `AGENTS.md` ancestry before editing, including
  [skill-authoring instructions](../AGENTS.md) for skills. Startup context is not a repository-wide
  instruction scan; see [harness loading](../../../docs/development/agent-harness-parity.md).
- For repository work, use the corresponding local skill adapter before its canonical plugin.
  `nextjs-vitest-test-authoring` maps to the local `web-vitest-test-authoring` adapter.
- Follow human direction, then the accepted plan, linked issues, and advisory AI reviews. Record
  material decisions with the saved plan or PR; do not duplicate them across mandatory ledgers.
- Keep the prelaunch, relational-storage, and client-parity constraints in [AGENTS.md](../../../AGENTS.md).
- Parallelize by default. Split work into independent units and run them at the same time, one
  worker and worktree per unit, within any cap the human set; peer sessions in other repositories
  count. Serialize only on a named dependency: an unreleased upstream API or fix, overlapping files
  or contracts (stack them; see [stacked PRs](../stacked-prs/SKILL.md)), writes in one shared
  worktree, or DB/Valkey-backed tests, which the coordinator runs one at a time.
- For upstream `vouchington-tooling` or `no-mistakes` work, open every independent PR at once,
  shepherd them together, and batch the merge request and release. Adopt here once a release
  contains what the change needs; work that does not need it starts now. A ready, queued, or
  shepherding PR does not pause other units.
- A permission-layer refusal is not a reason to delegate or disguise the same action. Report it.
  Follow an explicitly supplied safe alternative or documented sandbox retry for environment errors;
  see [agent sandbox](../../../docs/development/agent-sandbox.md).

## Read only the current phase

- Setup, freshness, and local services: [start of work](start-of-work.md).
- A plan is needed: [planning](../planning/SKILL.md); save it outside Git.
- Implementation and validation: [implementation](implementation.md).
- Substantive or risky review: [code review](code-review.md).
- Commit and push: [before pushing](before-pushing.md).
- PR creation, shepherding, and merge authority: [Git and PRs](git-and-prs.md).
- Native stack: [stacked PRs](../stacked-prs/SKILL.md).

Use the [skill catalog](../../catalog/README.md) to select another task-specific procedure rather
than loading every phase or checklist. Harness setup and privacy requirements are owned by
[harness parity](../../../docs/development/agent-harness-parity.md#privacy).
