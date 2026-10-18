# CI Documentation

The [CI reference](../ci.md) is canonical for the CI design rationale and gates. Workflow YAML and
`pnpm run ci:topology` are the source of truth for jobs, triggers, and dependencies.

- [Inline-workflow shell footguns](tooling/reference-inline-workflow-shell-footguns-actionlint-shellcheck.md)
- [Transient retry rules](transient-retry/README.md)
- [Artifact rerun safety](workflows/reference-artifact-rerun-safety.md)
- [Auto Harness automation](workflows/reference-harness-automation.md)
- [Merge queue run cancellation](workflows/reference-merge-queue-run-cancellation.md)
- [Sharding](workflows/reference-sharding.md)
- [Workflow trust boundary checklist](workflows/reference-pr-triggered-workflow-trust-boundary-checklist.md)
