# Playwright Path Filters

[Back to Workflow Authoring Reference](AUTHORING.md#playwright-path-filters)

- `tests-playwright.yml` owns app E2E tests and is triggered by `playwright.config.mts`, `playwright/config/**`, `backend/scripts/seeds/playwright-seed-assertions.mts`, `playwright/global-setup.mts`, `playwright/helpers/**`, and `playwright/tests/**`.
- `storybook.yml` owns Storybook browser-mode accessibility tests and is triggered by Storybook workflow, app, Vitest, package, and lockfile changes.
- Shared app and infrastructure paths such as `web/**`, `.github/actions/**`, and workflow orchestrator changes may intentionally trigger both workflows.
- Keep the refined `playwright` filter in `ci.yml` from matching Markdown-only, Vitest-only, test-helper-only, or Storybook-only changes. Playwright-owned `*.spec.mts` files under `playwright/tests/**` must still match.
