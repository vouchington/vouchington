# Runner-Level Concurrency Configuration

[Back to Workflow Runners](RUNNERS.md#runner-level-concurrency-configuration)

Runners can tune test parallelism without code changes. Worker counts are resolved via a 3-level priority chain:

1. **`~/.github-actions.env`** on the runner host (highest priority)
2. **GitHub Actions variables** (`vars.VITEST_MAX_WORKERS`, `vars.PLAYWRIGHT_MAX_WORKERS`)
3. **Config file defaults** — `VITEST_MAX_WORKERS`: 4 in CI, 30% locally; `PLAYWRIGHT_MAX_WORKERS`: 3 in CI, 30% locally

All test workflows call `./.github/actions/load-runner-env` early in their steps to apply this chain.

CI accepts only integer `VITEST_MAX_WORKERS` overrides. Values above 5 are capped at 5, and
percentage values fall back to 4. The cap keeps PostgreSQL-backed Vitest jobs within the CI
Postgres connection ceiling; see the [connection model](../../backend/data-stores/psql/reference-connection-model.md).

`VITEST_MAX_WORKERS` is the _only_ effective Vitest worker knob: vitest reads it during config
resolution after merging each project's config and unconditionally overwrites any project-level
`maxWorkers`, so a literal `maxWorkers` in `vitest.config.mts` or a project file is dead as soon as
this variable is set (which every test workflow does). A step that needs a different worker count
than the job-wide value — e.g. `web-storybook-browser`'s headless-browser cap — must override
`VITEST_MAX_WORKERS` itself in that step's `env:` block; setting only a project-specific env var
(e.g. `VITEST_STORYBOOK_BROWSER_MAX_WORKERS`) is not enough, because the job-wide
`VITEST_MAX_WORKERS` still wins during config resolution unless the step also sets it. Repo
config bans a literal `maxWorkers` outright — see `dev/vitest-config.test.mts`.

Vitest defaults to child-process forks locally and in CI because the full
DB-backed backend coverage run segfaulted under worker threads on Node 26.0.0.
Test workflows run Vitest and Playwright commands through `ci/with-node-test-options`
so test processes append `--disable-warning=DEP0205` without replacing any runner-provided
`NODE_OPTIONS`. This keeps Node 26 from printing Vite/Vitest/Playwright loader
deprecation warnings while upstream packages migrate from `module.register()`
to `module.registerHooks()`. Do not set `NODE_OPTIONS` or shell startup variables such as
`BASH_ENV` through `~/.github-actions.env`; GitHub Actions blocks `NODE_OPTIONS` writes
through `GITHUB_ENV`, and `load-runner-env` rejects startup-hook variables.

**`~/.github-actions.env` format** — supports plain `KEY=VALUE` and `export KEY=VALUE`; `#` comments and blank lines are ignored:

```bash
export VITEST_MAX_WORKERS=2
export PLAYWRIGHT_MAX_WORKERS=1
```

**Per-runner override** (without code changes): create `~/.github-actions.env` on the target runner.

**Repo-wide override** (without code changes): set `vars.VITEST_MAX_WORKERS` or `vars.PLAYWRIGHT_MAX_WORKERS` in GitHub Settings → Variables.
