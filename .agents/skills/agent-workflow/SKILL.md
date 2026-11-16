---
name: agent-workflow
description: Apply Voucha workflow constraints when planning, implementing, reviewing, or publishing repository changes.
---

# Vouchington workflow

## Canonical skill (required)

Claude Code, Codex, and Grok load the plugin skill `skills:agent-workflow`. If it cannot be loaded, stop and report the missing prerequisite; never apply this adapter alone.
Apply these local additions after the canonical skill. Resolve references relative to their owner;
do not reload a canonical skill or adapter already read in this task.

## Local constraints

- Read the target files' complete `AGENTS.md` ancestry before editing, including
  [skill-authoring instructions](../AGENTS.md) for skills. Startup context is not a repository-wide
  instruction scan; see [harness loading](../../../docs/development/agent-harness-parity.md).
- For repository work, use the corresponding local skill adapter before its canonical plugin.
  The upstream Next.js Vitest guidance maps to the local `web-vitest-test-authoring` adapter.
- Follow human direction, then the accepted plan, linked issues, and advisory AI reviews. Record
  material decisions with the saved plan or PR; do not duplicate them across mandatory ledgers.
- Keep the prelaunch, relational-storage, and client-parity constraints in [AGENTS.md](../../../AGENTS.md).
- Apply the canonical parallel-by-default rule; upstream means `skills`,
  `vouchington-tooling`, and `no-mistakes`. Vouchington also serializes writes in one shared worktree, DB/Valkey-backed tests
  (the coordinator runs them one at a time), and `pnpm exec` and `no-mistakes` calls, which share
  pnpm's store index and the no-mistakes lock across worktrees. Other parallel tools run through
  `node_modules/.bin/<tool>`; see [agent sandbox](../../../docs/development/agent-sandbox.md).
- A permission-layer refusal is not a reason to delegate or disguise the same action. Report it.
  Follow an explicitly supplied safe alternative or documented sandbox retry for environment errors;
  see [agent sandbox](../../../docs/development/agent-sandbox.md).

## Read only the current phase

- Setup, freshness, and local services: [start of work](start-of-work.md).
- A plan is needed: [planning](../planning/SKILL.md); save it outside Git.
- Implementation and validation: [implementation](implementation.md).
- Commit and push: [before pushing](before-pushing.md).
- PR creation, shepherding (or the optional `/shepherd` delegation to the triage loop), and merge
  authority: [Git and PRs](git-and-prs.md).
- Native stack: [stacked PRs](../stacked-prs/SKILL.md).

Use the [skill catalog](../../catalog/README.md) to select another task-specific procedure rather
than loading every phase or checklist. Harness setup and privacy requirements are owned by
[harness parity](../../../docs/development/agent-harness-parity.md#privacy).
