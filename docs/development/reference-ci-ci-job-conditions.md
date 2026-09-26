# CI Job Conditions

[Back to CI Reference](ci.md#ci-job-conditions)

There is no pre-merge CI orchestrator. Pull requests and merge groups start the seven required
checks independently: `static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`, and
`gitleaks`. Each area workflow calls
[`ci-detect-changes.yml`](../../.github/workflows/ci-detect-changes.yml) and uses its own path
filter to decide whether its area is selected. Workflow or local-action edits select every eligible
area; merge groups run every area. A selected area runs its full suite. An unselected area ends in a
passing required gate, making the skipped state explicit to branch protection.

Area static checks are the only prerequisite for their own suites. They do not serialize unrelated
areas. After selected suites pass, the area coverage job checks the full LCOV evidence against rules
owned by that area, then its required gate reports the result. Codecov is informational and does
not gate a pull request or merge group.

Main workflows retain their own path-scoped triggers and completed-run deployment receiver. They
are not a continuation of pull-request or merge-group CI. See [area test suites](ci.md#area-test-suites)
and [coverage gates](reference-ci-coverage-gates.md) for the detailed contracts.
