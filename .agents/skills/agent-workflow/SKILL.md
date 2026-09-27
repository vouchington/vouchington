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
- Keep writes serial within a shared worktree; the coordinator also serializes DB/Valkey-backed
  tests. Delegate bounded work when it improves execution or independent verification.
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
