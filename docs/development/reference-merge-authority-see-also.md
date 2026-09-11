# See also

[Back to Merge Authority](merge-authority.md#see-also)

- [CI Reference](ci.md) — Codex project-hook and sandbox wiring.
- [Auto Harness automation security boundary](../../.github/workflows/reference-harness-automation-accepted-risk.md)
  — the canonical accepted-risk statement and revisit triggers.
- [Git And PRs](../../.agents/skills/agent-workflow/git-and-prs.md) — the human-approval rule this
  hook enforces mechanically, including `gh stack merge`.
- [Native GitHub stack mechanics](../../.agents/skills/stacked-prs/SKILL.md) — auto-merge is
  unsupported on stacked PRs; a stack layer merges under the same per-layer human-approval rule as any
  other PR in [Git And PRs](../../.agents/skills/agent-workflow/git-and-prs.md) — there is no standing
  drain grant.
- [ready-and-shepherd](../../.agents/skills/ready-and-shepherd/SKILL.md) and
  [triage-prs](../../.agents/skills/triage-prs/SKILL.md) — the interactive batch-triage flows that
  arm auto-merge only with explicit human authorization, and the automation-label consumer.
