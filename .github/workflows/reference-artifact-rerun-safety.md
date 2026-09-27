# Artifact Rerun Safety

[Back to Workflow Reference](WORKFLOWS.md)

Every artifact upload has `retention-days: 1`. The repository-level artifact and log setting must
also be one day; `artifact-retention-policy.test.mts` rejects other values.

Area workflows use full LCOV artifacts only as same-run handoff to their own patch-coverage job.
Each suite uploads `lcov-full-<suite>` with the shared `upload-full-lcov` action. A failed attempt
may leave an unfinalized artifact name, so callers retry once with `-retry` and then make the
terminal `artifact-upload-outcome.mts` assertion. A selected area cannot pass its required gate
without the full LCOV evidence its patch rules need. Codecov receives the same full report as
informational evidence; it is never a required check.

Artifact names in workflows and composite actions must remain classified `keep` or `delete` in
[`ci/cleanup-artifacts-patterns.json`](../../ci/cleanup-artifacts-patterns.json). The same-run
cleanup runs only after the relevant main-branch producer and its required consumers succeed or
legitimately skip. Pull-request workflows do not get `actions: write` for cleanup, because their
workflow definition is PR-controlled; their artifacts expire naturally.

Keep required producer-consumer handoffs visible to the workflow topology model. It resolves only
same-run jobs, including local reusable workflows. Inspect the result with `pnpm run ci:topology`.
See [CI Reference: Workflow Topology Contracts](../../docs/development/ci.md#workflow-topology-contracts).
