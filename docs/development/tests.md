# Tests and Checks

Run the cheap before-push commands in [commit.md](../checklists/commit.md#before-pushing), then push. GitHub Actions is the full gate. See [ci.md](ci.md) for CI workflow, config, and coverage details.

The staged production no-op Promise-catch rule, its inventory, and its remediation/promotion
sequence are part of [Linters and Static Analysis](reference-tests-linters-and-static-analysis.md).

**Init column:** `monorepo` = `./dev/initialize monorepo` is sufficient. `web` = requires `./dev/initialize web` (Docker, DB, Valkey, `.env`, HTTPS certs, CF Worker env). A row marked `web` here is the tested/documented baseline, not necessarily a hard floor — some `web`-tagged commands only need DB/Valkey and would also pass under `./dev/initialize backend`; when in doubt, initialize `web`.

**Sourcing `.env`:** `./dev/initialize` writes `.env` but does not export it into your shell. `./dev/tmux`'s service windows source it automatically. Before running a DB/Valkey-backed command in your own shell, run `source .env`; otherwise the data-store globalSetup fails with `DATABASE_URL is not set in the current shell`.

## Contents

- <a id="test-command-matrix"></a>[Test Command Matrix](reference-tests-command-matrix.md)
- <a id="local-web-validation-recovery"></a>[Local Web Validation Recovery](reference-tests-local-web-validation-recovery.md)
- <a id="first-push-deterministic-preflight"></a>[First-Push Deterministic Preflight](reference-tests-first-push-deterministic-preflight.md)
- <a id="linters-and-static-analysis"></a>[Linters and Static Analysis](reference-tests-linters-and-static-analysis.md)
- <a id="claudemd-and-agentsmd-size-cap"></a>[CLAUDE.md and AGENTS.md Size Cap](reference-tests-claude-md-and-agents-md-size-cap.md)
- <a id="vitest-projects"></a>[Vitest Projects](reference-tests-vitest-projects.md)
- <a id="pools-isolation-and-vitest-5"></a>[Pools, Isolation, and Vitest 5](reference-tests-vitest-projects.md#pools-isolation-and-vitest-5)
- <a id="parallel-safety-and-test-root-hygiene"></a>[Parallel-Safety and Test-Root Hygiene](reference-tests-parallel-safety-and-test-root-hygiene.md)
- <a id="route-test-server-errors"></a>[Route-Test Server Errors](reference-tests-parallel-safety-and-test-root-hygiene.md#unexpected-route-test-500s-print-the-server-error)
- <a id="local-patch-coverage-preview"></a>[Local Patch Coverage Preview](reference-tests-local-patch-coverage-preview.md)
- <a id="test-value-and-safe-reduction"></a>[Test Value and Safe Reduction](reference-tests-value-and-reduction.md)
- <a id="vitest-mock-typing"></a>[Vitest Mock Typing](reference-tests-vitest-mock-typing.md)
- <a id="storybook-a11y-exceptions"></a>[Storybook A11y Exceptions](reference-tests-storybook-a11y-exceptions.md)
- <a id="smoke-tests"></a>[Smoke Tests](reference-tests-smoke-tests.md)
- <a id="e2e-and-visual"></a>[E2E and Visual](reference-tests-e2e-and-visual.md)
- <a id="playwright-matchers-and-helpers"></a>[Playwright Matchers and Helpers](reference-tests-playwright-matchers-and-helpers.md)
- <a id="schema-checks"></a>[Schema Checks](reference-tests-schema-checks.md)
- <a id="translation-catalog-and-locale-checks"></a>[Translation Catalog and Locale Checks](reference-tests-translation-catalog-and-locale-checks.md)
