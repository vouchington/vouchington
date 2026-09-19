# Maintenance, Security, And Utilities

[Back to Workflow Reference](WORKFLOWS.md#maintenance-security-and-utilities)

| Workflow                                                | Type                  | Runner          | Docker | Purpose                                                                                                                                        |
| ------------------------------------------------------- | --------------------- | --------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [GitHub Actions Static Analysis](actionlint.yml)        | Standalone            | `[self-hosted]` | No     | Runs Actionlint and Zizmor when workflow, composite-action, Dependabot, or tool configuration changes.                                         |
| [Gitleaks](gitleaks.yml)                                | Standalone            | `[self-hosted]` | No     | Secret scanning.                                                                                                                               |
| [Lint Links](lint-links.yml)                            | Standalone            | `[self-hosted]` | No     | Checks Markdown links on every PR and main push so deletions or moves of non-Markdown link targets cannot bypass validation; also runs weekly. |
| [Label PRs](label-pr.yml)                               | Standalone            | `[self-hosted]` | No     | Applies PR labels.                                                                                                                             |
| [Dependabot PR Auto-merge](dependabot-pr-automerge.yml) | Standalone            | `ubuntu-slim`   | No     | Delegates generic eligibility to the pinned shared tooling action.                                                                             |
| [pnpm Dedupe](pnpm-dedupe.yml)                          | Standalone            | `ubuntu-latest` | No     | Scheduled lockfile dedupe PR workflow.                                                                                                         |
| [Cleanup Artifacts](cleanup-artifacts.yml)              | Reusable + standalone | `[self-hosted]` | No     | Deletes delete-classified Actions artifacts from producer terminal fan-ins, plus a 6-hourly scheduled/manual sweep.                            |
| [GHCR Cleanup](ghcr-cleanup.yml)                        | Standalone            | `ubuntu-slim`   | No     | Weekly prune of the container package versions published by Main CI (backend). Scheduled runs delete; manual runs list unless asked to apply.  |
