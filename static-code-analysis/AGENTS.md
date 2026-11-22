# Static analysis

- Load skills: `static-analysis-checklist`.
- Rule docs: [static analysis index](../docs/development/quality/static-code-analysis/README.md).
- Validate tracked Git state (`git ls-files` or equivalent); ignored/untracked files neither fail
  nor satisfy guards. The working-tree `jscpd` CLI is the documented exception.
- Generic package-owned checks change upstream in `no-mistakes`; configure its released package
  here, never patch it locally.
- Wire durable repo checks into their owning aggregate and `.github/workflows/static-code-analysis.yml`,
  except explicitly documented local-only checks.
