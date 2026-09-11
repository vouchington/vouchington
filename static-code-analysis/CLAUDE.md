# Static Code Analysis

Before adding, changing, replacing, or removing a guard, read the
[static-analysis-checklist skill](../.agents/skills/static-analysis-checklist/SKILL.md) and the
[canonical rule-authoring guide](README.md).

## Scoped invariants

- Validate tracked repository state, not generated workspace state. Use `git ls-files` or an
  equivalent git-aware API; ignored and untracked files must neither fail nor satisfy a guard.
- Do not patch package-owned checks here. Change generic `no-mistakes` behavior upstream and
  configure the released package in this repository.
- Wire durable repo-owned checks into the owning local aggregate and
  `.github/workflows/static-code-analysis.yml`, unless the README explicitly documents a local-only
  exception.
- Keep [README.md](README.md), [CI docs](../docs/development/ci.md), and
  [test docs](../docs/development/tests.md) synchronized with changed behavior, commands, and CI
  coverage.
