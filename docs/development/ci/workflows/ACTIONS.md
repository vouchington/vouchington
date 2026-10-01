# Workflow Composite Actions

## Composite Actions

Use shared composite actions in [`.github/actions/`](../../../../.github/actions/) instead of repeating inline steps. Available actions:

| Action              | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Required inputs                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `upload-full-lcov`  | Validate one lowercase hyphen-delimited suite identity, then make one GitHub artifact upload attempt of `coverage-full/lcov.info` as `lcov-full-<suite>`. The owning area patch-coverage gate reads it and Codecov receives it only as informational evidence. Uses `if-no-files-found: error`; callers retry once with `name-suffix: -retry` and require a persisted attempt with `artifact-upload-outcome.mts`.                                                                                                                                                | `suite`, `name-suffix`                                  |
| `make-shard-matrix` | Generate a JSON shard matrix array and total count for use with `strategy.matrix`. Input `total` must be a positive integer. Outputs: `matrix` (e.g. `[1,2,3]`), `total`.                                                                                                                                                                                                                                                                                                                                                                                        | `total`                                                 |
| `setup-lychee`      | Install the pinned Lychee binary with publisher checksum verification for Markdown link checks. Uses a job-scoped binary directory and versioned archive/extract paths so the job never relies on mutable home-directory state.                                                                                                                                                                                                                                                                                                                                  | none                                                    |
| `setup-aws`         | Wrap `aws-actions/configure-aws-credentials` (SHA-pinned) to assume an OIDC role. Passes a hardcoded native `action-timeout-s: 90` so a stalled role assumption fails fast and attributably. The calling job must have `id-token: write` in its `permissions` block, and the caller keeps a two-minute `timeout-minutes` backstop on the step itself, since a composite step cannot declare one for itself. See [Step Timeouts](reference-step-timeouts.md#step-timeouts).                                                                                       | `role-arn`; optional `aws-region` (default `us-west-2`) |
| `setup-node-pnpm`   | Setup Node.js and pnpm, then one full workspace install. Steps run `actions/setup-node` (reads `.nvmrc`, `package-manager-cache: false`), `pnpm/action-setup` with `version: latest-12` (the newest pnpm 12 release at least a day old; there is no `packageManager` pin), a SHA-pinned `actions/cache` step for the resolved `pnpm store path --silent` directory, then `pnpm install --frozen-lockfile --loglevel=warn` (`--ignore-scripts` when `install-scripts: 'false'`). Every runner is fresh and ephemeral, so there is no reconciliation or filtering. | optional `install-scripts` (default `true`)             |
| `setup-backend`     | `setup-node-pnpm`, then an explicit `email-templates` build because `email-templates/package.json` has no `prepare`/`postinstall` script.                                                                                                                                                                                                                                                                                                                                                                                                                        | none                                                    |
| `build-web-targets` | Build the production-profile Cloudflare Worker and Next.js standalone server once in `static-web` (or a standalone test workflow's shard-prep job), then save the runtime outputs to an exact run-scoped cache. Consumer jobs restore and validate the run-bound manifest and runtime output; a cache miss, failed restore, or incomplete output triggers the same local build. Sources `.env` if present and normalizes compile-time CI settings.                                                                                                               | `shared-build-cache-mode` (`producer` or `consumer`)    |
| `setup-playwright`  | Install Playwright browsers. Every runner is fresh and ephemeral, so `~/.cache/ms-playwright` is restored from a SHA-pinned `actions/cache` step keyed on the pnpm lockfile hash with no `restore-keys`; a stale or mismatched browser cache cannot silently restore. Host-dependency and browser installation runs through `nick-fields/retry` with a 120-second attempt timeout and one retry; the calling step timeout is the backstop.                                                                                                                       | none                                                    |

A composite that wraps a network-bound third-party action (e.g. `setup-aws` wrapping `aws-actions/configure-aws-credentials`) must bound that action two ways: a hardcoded native timeout inside the composite, passed as a literal rather than an overridable input, so a stall fails fast with a diagnostic attributable to that action; and a caller-side `timeout-minutes` on every calling step, since a composite step cannot declare `timeout-minutes` for itself (enforced by no-mistakes [`github-actions-composite-step-schema`](../../../../.no-mistakes.yml)). See [Step Timeouts](reference-step-timeouts.md#step-timeouts) and no-mistakes `github-actions-action-timeout-pair` in [`.no-mistakes.yml`](../../../../.no-mistakes.yml).

Jobs that need pnpm without a workspace install (`build-backend-images`,
`initialize-smoke-test.yml`, `postgresql-snapshot-update.yml`) run `actions/setup-node` and then
`pnpm/action-setup` with the same `version: latest-12`. setup-node must come first: the action picks
its pnpm bootstrap from the Node on `PATH`, and the pnpm shims it writes run that Node.
`standalone` would swap in a bundled Node. A bare `version: 12` would keep the release the action
bundles, which lags the fixes this repo relies on (an older bundled 12.x fails `pnpm dlx` on ignored
build scripts).
`pnpm-activation.test.mts` enforces the order, that every call site passes only the same
`latest-<major>` `version` (its major matching the Dockerfiles' `PNPM_VERSION`), that the root
`package.json` has no `packageManager` pin, and that no step activates pnpm through corepack or npm.

Set `setup-node-pnpm`'s `install-scripts: 'false'` for control-plane jobs that only execute Node
tools whose dependency graph needs no install-time build, and do not build workspace artifacts. This keeps unrelated dependency
lifecycle hooks, including native-addon downloads, outside the automation control path. The exact
caller allowlist is enforced by `pnpm-install-policy.test.mts`; do not broaden it for application
build or test jobs that require install-time artifacts. The two install modes are separate steps
gated by complementary `if:` conditions rather than a shell `case`, so no-mistakes'
`tsconfig-gate-coverage` can model the composite action; callers pass only the literal `'false'`.

Both installs pass `--loglevel=warn` so a job log shows warnings and failures instead of progress
and the root `devDependencies:` summary. That level needs pnpm 12.8 or newer to keep a failed
lifecycle script's output and a failed supply-chain verdict; see
[CI reference](../../ci.md).

CI worker policy is versioned with the repository: Vitest falls back to two workers, backend
Vitest workflows explicitly use three, the pure web unit-test job explicitly uses four, Storybook
browser mode remains serial, and Playwright uses three. Workflows must not load mutable
runner-local worker configuration.

## Secret and Permission Scoping

- **High-privilege secrets stay scoped to trusted-context jobs.** Deploy credentials and secrets
  such as `OPENAI_API_KEY`/`STRIPE_SECRET_KEY` are only injected when
  `changes.outputs.trusted-secret-context == 'true'` (same-repository PR or merge group). Area
  coverage jobs carry no `id-token: write` grant and use GitHub artifacts only. The separate
  informational Codecov uploader has `id-token: write` but executes no repository scripts or local
  actions. See [COVERAGE.md](COVERAGE.md).
- **Script bodies interpolate only constant expressions.** A `run:` or `actions/github-script`
  `script:` body in a workflow or composite action may contain `${{ }}` only for values GitHub or
  the workflow fixes before the job starts (`github.repository`, `github.run_id`, `runner.temp`,
  `matrix.shard`, and the like). Event payloads, refs, inputs, step and job outputs, secrets, and
  vars reach the script through `env:` and are read as quoted shell variables, so text derived from
  an event or a third-party action's output is data rather than shell syntax.
  `workflow-script-expressions.test.mts` owns the allowlist and enforces it.
- **`$GITHUB_ENV`/`$GITHUB_PATH` poisoning is inherent to GitHub Actions.** Any step in a job can
  write to either file and influence later steps in the same job; no stdout guard covers a direct
  file write. Secret-bearing jobs stay gated by `trusted-secret-context` as above, which bounds the
  blast radius rather than eliminating the mechanism.
