# Workflow Composite Actions

## Composite Actions

Use shared composite actions in [`.github/actions/`](../actions/) instead of repeating inline steps. Available actions:

| Action                 | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Required inputs                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `upload-coverage-pair` | Validate one lowercase hyphen-delimited suite identity, then perform exactly one GitHub fallback upload of `coverage/lcov.info` and `coverage/coverage-manifest.json` as `coverage-<suite>`. The caller keeps each attempt's stable ID, eligibility expression, nonblocking outcome, and three-minute timeout.                                                                                                                                                                                      | `suite`                                                 |
| `upload-full-lcov`     | Validate one lowercase hyphen-delimited suite identity, then perform one best-effort GitHub artifact upload of the full (pre-patch-sparsification) `coverage-full/lcov.info` as `lcov-full-<suite>`, for later informational-only ingestion by Codecov. Uses `if-no-files-found: warn`, never `error`, since the file may legitimately be absent.                                                                                                                                                   | `suite`                                                 |
| `make-shard-matrix`    | Generate a JSON shard matrix array and total count for use with `strategy.matrix`. Input `total` must be a positive integer. Outputs: `matrix` (e.g. `[1,2,3]`), `total`.                                                                                                                                                                                                                                                                                                                           | `total`                                                 |
| `setup-lychee`         | Install the pinned Lychee binary with publisher checksum verification for Markdown link checks. Uses a job-scoped binary directory and versioned archive/extract paths so the job never relies on mutable home-directory state.                                                                                                                                                                                                                                                                     | none                                                    |
| `setup-aws`            | Wrap `aws-actions/configure-aws-credentials` (SHA-pinned) to assume an OIDC role. Passes a hardcoded native `action-timeout-s: 90` so a stalled role assumption fails fast and attributably. The calling job must have `id-token: write` in its `permissions` block, and the caller keeps a two-minute `timeout-minutes` backstop on the step itself, since a composite step cannot declare one for itself. See [Step Timeouts](reference-step-timeouts.md#step-timeouts).                          | `role-arn`; optional `aws-region` (default `us-west-2`) |
| `setup-node-pnpm`      | Setup Node.js and pnpm, then one full workspace install. Steps run `actions/setup-node` (reads `.nvmrc`, `package-manager-cache: false`), `pnpm/action-setup` with no inputs (pnpm comes from `package.json#packageManager`), a SHA-pinned `actions/cache` step for the resolved `pnpm store path --silent` directory, then `pnpm install --frozen-lockfile` (`--ignore-scripts` when `install-scripts: 'false'`). Every runner is fresh and ephemeral, so there is no reconciliation or filtering. | optional `install-scripts` (default `true`)             |
| `setup-backend`        | `setup-node-pnpm`, then an explicit `email-templates` build because `email-templates/package.json` has no `prepare`/`postinstall` script.                                                                                                                                                                                                                                                                                                                                                           | none                                                    |
| `build-web-targets`    | Build the production-profile Cloudflare Worker and Next.js standalone server once in `static-web` (or a standalone test workflow's shard-prep job), then save the runtime outputs to an exact run-scoped cache. Consumer jobs restore and validate the run-bound manifest and runtime output; a cache miss, failed restore, or incomplete output triggers the same local build. Sources `.env` if present and normalizes compile-time CI settings.                                                  | `shared-build-cache-mode` (`producer` or `consumer`)    |
| `setup-playwright`     | Install Playwright browsers. Every runner is fresh and ephemeral, so `~/.cache/ms-playwright` is restored from a SHA-pinned `actions/cache` step keyed on the pnpm lockfile hash with no `restore-keys`; a stale or mismatched browser cache cannot silently restore.                                                                                                                                                                                                                               | none                                                    |

A composite that wraps a network-bound third-party action (e.g. `setup-aws` wrapping `aws-actions/configure-aws-credentials`) must bound that action two ways: a hardcoded native timeout inside the composite, passed as a literal rather than an overridable input, so a stall fails fast with a diagnostic attributable to that action; and a caller-side `timeout-minutes` on every calling step, since a composite step cannot declare `timeout-minutes` for itself (enforced by no-mistakes [`github-actions-composite-step-schema`](../../.no-mistakes.yml)). See [Step Timeouts](reference-step-timeouts.md#step-timeouts) and no-mistakes `github-actions-action-timeout-pair` in [`.no-mistakes.yml`](../../.no-mistakes.yml).

Jobs that need pnpm without a workspace install (`build-backend-images`,
`initialize-smoke-test.yml`) run `actions/setup-node` and then `pnpm/action-setup` with no inputs.
setup-node must come first: the action picks its pnpm bootstrap from the Node on `PATH`, and the
pnpm shims it writes run that Node. A `version` input would duplicate the `packageManager` pin, and
`standalone` would swap in a bundled Node. `pnpm-activation.test.mts` enforces the order, the absent
inputs, and that no step activates pnpm through corepack or npm.

Set `setup-node-pnpm`'s `install-scripts: 'false'` for control-plane jobs that only execute Node
tools whose dependency graph needs no install-time build, and do not build workspace artifacts. This keeps unrelated dependency
lifecycle hooks, including native-addon downloads, outside the automation control path. The exact
caller allowlist is enforced by `pnpm-install-policy.test.mts`; do not broaden it for application
build or test jobs that require install-time artifacts. The two install modes are separate steps
gated by complementary `if:` conditions rather than a shell `case`, so no-mistakes'
`tsconfig-gate-coverage` can model the composite action; callers pass only the literal `'false'`.

CI worker policy is versioned with the repository: Vitest falls back to two workers, backend
Vitest workflows explicitly use three, the pure web unit-test job explicitly uses four, Storybook
browser mode remains serial, and Playwright uses three. Workflows must not load mutable
runner-local worker configuration.

## Secret and Permission Scoping

- **High-privilege secrets stay scoped to trusted-context jobs.** Deploy credentials and secrets
  such as `OPENAI_API_KEY`/`STRIPE_SECRET_KEY` are only injected when
  `detect-changes.outputs.trusted-secret-context == 'true'` (same-repo push/merge). Coverage and
  Vitest-blob transport jobs carry no `id-token: write` grant: producers and the patch-coverage
  consumer use GitHub artifacts with `actions: read`/`actions: write` only. The separate
  informational Codecov uploader has `id-token: write` but executes no repository scripts or local
  actions. See [COVERAGE.md](COVERAGE.md#provenance-and-transport).
- **`$GITHUB_ENV`/`$GITHUB_PATH` poisoning is inherent to GitHub Actions.** Any step in a job can
  write to either file and influence later steps in the same job; no stdout guard covers a direct
  file write. Secret-bearing jobs stay gated by `trusted-secret-context` as above, which bounds the
  blast radius rather than eliminating the mechanism.
