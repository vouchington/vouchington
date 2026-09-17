---
name: planning
description: Create evidence-backed Vouchington implementation plans. Loads the portable Vouchington planning workflow, then applies local Plan issue and validation policy.
---

# Vouchington Planning Adapter

## Canonical skill (required)

Use `vouchington-workflow:planning` when the runtime provides it; otherwise read the installed canonical `node_modules/vouchington-tooling/skills/planning/SKILL.md` and resolve its supporting resources relative to that directory. If the canonical skill cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

The runtime chooses its available agents; if an independent reviewer cannot run, obtain human acceptance before treating the Plan as final.

## Vouchington additions

Read [impact discovery](references/impact-discovery.md) and [live-browser preflight](references/live-browser-preflight.md).
Use the exact local [Plan template](references/plan-template.md), then run
`node dev/plan-issue.mts validate --title "Plan: …" --body-file <file>` so every
repository-owned verification command resolves in the current worktree. Create validated Plan
issues through the [GitHub issue workflow](../github-issue/SKILL.md), including local taxonomy,
project or milestone selection, and post-create verification.
