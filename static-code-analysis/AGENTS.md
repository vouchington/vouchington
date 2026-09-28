# Static analysis

- Load [static-analysis-checklist](../.agents/skills/static-analysis-checklist/SKILL.md) and [rule authoring](../docs/development/quality/static-code-analysis/README.md) before guard changes/removal.
- Validate tracked Git state (`git ls-files` or equivalent); ignored/untracked files neither fail nor satisfy guards. The working-tree `jscpd` CLI is the documented exception; see [scope](../docs/development/quality/static-code-analysis/jscpd/README.md#scope).
- Generic package-owned checks change upstream in `no-mistakes`; configure its released package here, never patch it locally.
- Wire durable repo checks into their owning aggregate and `.github/workflows/static-code-analysis.yml`, except explicitly documented local-only checks.
- Synchronize [rule docs](../docs/development/quality/static-code-analysis/README.md), [CI](../docs/development/ci.md), and [tests](../docs/development/tests.md) when behavior/commands/coverage change.
