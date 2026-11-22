# Static analysis

- Load skills: `static-analysis-checklist`.
- Rule docs: [static analysis index](../docs/development/quality/static-code-analysis/README.md).
- The working-tree `jscpd` CLI is the one check that reads untracked files.
- Generic package-owned checks change upstream in `no-mistakes`; configure its released package
  here, never patch it locally.
- Wire durable repo checks into their owning aggregate and `.github/workflows/static-code-analysis.yml`,
  except explicitly documented local-only checks.
