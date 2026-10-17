# CI Documentation

The [CI reference](../ci.md) is canonical for the CI design rationale and gates. Workflow YAML and
`pnpm run ci:topology` are the source of truth for jobs, triggers, and dependencies.

- [Inline-workflow shell footguns](tooling/reference-inline-workflow-shell-footguns-actionlint-shellcheck.md)
- [Transient retry rules](transient-retry/README.md)

## Workflow references

- [Workflow Reference](workflows/WORKFLOWS.md)
- [Core CI](workflows/reference-core-ci.md)
- [Deploy And Release](workflows/reference-deploy-and-release.md)
- [Maintenance, Security, And Utilities](workflows/reference-maintenance-security-and-utilities.md)
- [Playwright And Storybook](workflows/reference-playwright-and-storybook.md)
- [Vitest](workflows/reference-vitest.md)
- [Workflow automation: Always run](workflows/reference-workflow-automation-always-run.md)
- [Workflow automation: Main](workflows/reference-workflow-automation-main.md)
- [Workflow automation map](workflows/reference-workflow-automation-map.md)
- [Pull-request workflow automation](workflows/reference-workflow-automation-pull-requests.md)
- [Workflow Job & Runner Inventory](workflows/JOBS.md)
- [Vitest CI Mapping](workflows/VITEST.md)
- [Artifact Rerun Safety](workflows/reference-artifact-rerun-safety.md)
- [Fix Main dependency policy](workflows/reference-fix-main-dependency-policy.md)
- [Fixed-Branch Automation PRs](workflows/reference-fixed-branch-automation-prs.md)
- [Auto Harness automation](workflows/reference-harness-automation.md)
- [Merge Queue Run Cancellation](workflows/reference-merge-queue-run-cancellation.md)
- [PR-Triggered Workflow Trust Boundary Checklist](workflows/reference-pr-triggered-workflow-trust-boundary-checklist.md)
- [Sharding](workflows/reference-sharding.md)
- [Workflow Change Preflight](workflows/reference-workflow-change-preflight.md)
