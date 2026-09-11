# Workflow Reference

This reference groups GitHub Actions workflows by purpose. `Type` is `Standalone` for direct
entrypoints and `Reusable` for workflows called through `uses: ./.github/workflows/*.yml`.
`inherited via uses` means the top-level workflow delegates runner selection to reusable callees.
For the exact, generated per-job `runs-on` and `timeout-minutes` behind that summary -- including
what each reusable-workflow call actually inherits -- see [JOBS.md](JOBS.md).

[Workflow automation map](reference-workflow-automation-map.md)

## Contents

- <a id="core-ci"></a>[Core CI](reference-core-ci.md)
- <a id="vitest"></a>[Vitest](reference-vitest.md)
- <a id="playwright-and-storybook"></a>[Playwright And Storybook](reference-playwright-and-storybook.md)
- <a id="deploy-and-release"></a>[Deploy And Release](reference-deploy-and-release.md)
- <a id="auto-harness-automation"></a>[Auto Harness Automation](reference-harness-automation.md)
- <a id="maintenance-security-and-utilities"></a>[Maintenance, Security, And Utilities](reference-maintenance-security-and-utilities.md)
