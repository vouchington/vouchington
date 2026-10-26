# Vouchington retrospective validation

The canonical `vouchington-workflow:retrospective` skill owns the CI failure, assessment, and
claim-wording guidance. Its `retrospective/references/ci-failures.md`
provides the shared block grammar.

Vouchington's [`validateRetroDoc`](../../../dev/retrospective-validate.mts) enforces the local
report shape: `## CI Failures` follows `## Transcript Facts`, and each GitHub Actions failure
block includes the `no-mistakes impact: selected|missed (<gap>)|n/a (<why>)` disposition.
[`retrospective-validate-ci.mts`](../../../dev/retrospective-validate-ci.mts) and
[`retrospective-validate-assessments.mts`](../../../dev/retrospective-validate-assessments.mts)
are authoritative if this page diverges from the validator.
