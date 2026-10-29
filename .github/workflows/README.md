# GitHub Actions workflow reference

This is the direct workflow documentation index linked from the repository CI docs. Use the guide that matches the workflow work at hand; the focused sections below
keep each topic within one further link hop.

## Focused references

- [Artifact rerun safety](../../docs/development/ci/workflows/reference-artifact-rerun-safety.md)
- [Auto Harness automation](../../docs/development/ci/workflows/reference-harness-automation.md)
- [Merge queue run cancellation](../../docs/development/ci/workflows/reference-merge-queue-run-cancellation.md)
- [PR-triggered workflow trust boundary checklist](../../docs/development/ci/workflows/reference-pr-triggered-workflow-trust-boundary-checklist.md)
- [Sharding](../../docs/development/ci/workflows/reference-sharding.md)

The EXPLAIN copyright seed and reader processes share a run-scoped, file-backed external S3
fixture through an explicit Node preload. The same fake replay-HMAC ring and key namespace must
remain available across those processes: wrapped key objects are authoritative outside PostgreSQL.
The preload handles only retention-key commands for the configured copyright bucket and preserves
other SDK behavior, including presigning. It is test harness configuration, never a runtime fallback.
