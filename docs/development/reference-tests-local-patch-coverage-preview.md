# Local Patch Coverage Preview

[Back to Tests and Checks](tests.md#local-patch-coverage-preview)

Run relevant Vitest projects with `--coverage` before pushing when changed lines are covered by
[`.coverage-rules.yml`](../../.coverage-rules.yml). Then run:

```bash
pnpm run coverage:patch
```

`pnpm run coverage:patch` is the optional local patch-coverage preview. CI PR coverage remains
blocking.

This changed-line preview is distinct from the historical full-summary comparison in
[Test Value and Safe Reduction](reference-tests-value-and-reduction.md#evidence-for-a-reduction).
Use the historical comparator when a test reduction needs exact base/head total evidence; it does
not replace patch coverage for edited lines.

The command accepts only signed local coverage pairs (`lcov.info` plus
`coverage-manifest.json`). It validates the repository, current `HEAD`, local-run identity,
collector, ordered projects, LCOV digest, and source-root digest before invoking
`coverage-check`; unsigned or stale reports fail closed. It then verifies tracked test files are
included in exactly one Vitest project and
previews the same patch-coverage calculation that CI uses by running
`coverage-check check --rules .coverage-rules.yml --artifacts coverage --base origin/main --head HEAD --annotate-source`.
It checks changed lines against local LCOV, not before/after total coverage. Use `--artifacts`,
`--base`, `--head`, and `--json` when reproducing a different artifact directory or diff:

```bash
pnpm run coverage:patch --artifacts coverage-artifacts --base origin/main --head HEAD
```

Patch coverage is rename-aware: unchanged lines that only moved paths should not require new tests.
The pinned `coverage-check` package requests Git rename detection with no rename-attempt limit before
parsing changed lines. Edited lines inside moved files still need coverage.

### Cheapest local preview (just the test files you touched)

`pnpm run coverage:changed` is the cheapest coverage signal in this family. Unlike every other
command above, it does not read pre-generated `lcov.info`/`coverage-manifest.json` pairs or a
registered suite — it computes the changed files itself (staged, unstaged, **and untracked**, via
`--head WORKTREE`), splits them into changed test files (`*.test.{mts,ts,tsx}` /
`*.spec.{mts,ts,tsx}`) and changed source files, and runs Vitest with `--coverage` over only the
literal changed test files — the same file set `vitest run <file> --bail=3` would run before
pushing, plus instrumentation:

```bash
pnpm run coverage:changed
```

If no test files changed, it prints a message and exits `0` without running Vitest. If the Vitest
run itself fails, `coverage:changed` propagates that real exit code and skips the coverage report
entirely — a failing test is never softened into an "advisory" pass. Only once Vitest succeeds does
it evaluate coverage against `.coverage-rules.yml` (via `coverage-check`, same as `coverage:patch`)
and print a three-section report:

- **Covered** — changed lines with LCOV hits, grouped by file.
- **Uncovered** — changed lines with no LCOV hit, each with its trimmed source line.
- **No coverage data** — changed files under a positive-threshold rule with no LCOV record at all
  (the file was never loaded by the test files you ran), printed as collapsed line ranges.

This coverage evaluation is **always advisory**: the command exits `0` regardless of the report's
outcome, even when a changed file shows up under "No coverage data" for a 100%-threshold path. It is
a preview to react to locally, not a gate — `coverage:patch:full` and CI remain the authoritative,
blocking checks.

**Not part of the required before-push sequence.** `coverage:changed` is consistently slower —
in local measurements against a real changed test file, roughly 30-40% slower wall-clock than the
bare `vitest run <file> --bail=3` step it could replace, driven by coverage instrumentation plus the
extra diff computation, manifest stamp/validate round-trip, and a second `coverage-check` evaluation
pass. Because that gap isn't close, `before-pushing.md` still uses the bare `vitest run` command;
run `coverage:changed` yourself, by hand, whenever you want the extra coverage signal before pushing.

### Full-Suite Local Merge (reproducing the CI merged gate)

`pnpm run coverage:patch` only sees the `lcov.info` files you generated locally. CI fans in
parallel suite jobs and merges them before running the gate — so a gap invisible to your local run
can fail the merged CI gate.

To reproduce the merged CI gate locally, run all non-credentialed Vitest suites with coverage and
merge them in one command:

```bash
pnpm run coverage:patch:full
```

This runs every suite that does not require web initialization (`ts-shared`, `backend-modules`,
`web`, `web-storybook`, `lambdas`, `cloudflare-worker`, `tooling`), collects each suite's `lcov.info` into
`coverage-full/<suite>/`, stamps and validates its manifest immediately after that suite succeeds,
then `ci/coverage-check-gate.mts` runs the same `coverage-check`
aggregate-artifacts gate as `coverage:patch`.

Web-init suites (`playwright-helpers`, `backend-data-stores`, `web-integration`) are automatically included when
`./dev/initialize web` has been run (`.initialized` contains `"web"` and `.env` exists); they are
skipped with a diagnostic otherwise. The Playwright helper project is kept separate from generic
tooling so its authentication helpers receive the validated worktree DB/Valkey environment.
`backend-aws`, `backend-openai`, `backend-bedrock`, and
`backend-stripe` require real API credentials and are intentionally excluded. Only suites marked
with `requiresWebInit: true` receive DB/Valkey environment variables; all other suites have those
variables stripped so a previously sourced `.env` cannot change their connection behavior.
For web-init suites, `coverage:patch:full` sources the current worktree `.env` before the run and
rejects a stale or mismatched `WORKTREE_DIR` before Vitest starts.
The local `web-api` and `web-integration` coverage suites then remove `CF_WORKER_SECRET` so their
direct backend requests cannot inherit the Worker-to-backend trust credential from `.env`.

```bash
pnpm run coverage:patch:full --base origin/main --head HEAD
```

Each uncovered line is printed with its trimmed source text so you can immediately see which construct
needs to be executed. Two common sources of confusion:

- **Default parameters** — `function f(a = 1)` is only marked covered when the function is called
  _without_ that argument so the default expression executes.
- **Object destructuring with default values** — `const { x = 1 } = opts` is only marked covered when the default value expression executes (i.e., when the property is missing/undefined in `opts`).

### Cross-project / multi-project patch coverage

When a PR touches more than one Vitest suite (e.g. `backend`, `web`, `cloudflare-worker`,
`ts-shared`), use the affected-suite command instead of running each suite by hand:

```bash
pnpm run coverage:patch:affected
```

This detects which suites the committed diff touches (by path-prefix matching), runs each affected
suite in isolation with `--coverage`, stamps and validates each artifact, and runs the same
`coverage-check` gate as `coverage:patch`. On a shortfall it prints per-suite reproduce commands.
If a suite fails before coverage can be checked, the command stops there and prints the single failed
suite command plus the exact `coverage:patch:affected -- --base ... --head ...` retry.

**Advisory by default.** A coverage shortfall or an unverified file (see below) is printed but does
not fail the command — only a real gate error (bad rules file, git diff failure) still exits
non-zero. Pass `--strict` to restore the previous blocking behavior:

```bash
pnpm run coverage:patch:affected -- --strict
```

**Fast pre-check only.** CI and `pnpm run coverage:patch:full` remain authoritative and blocking —
path-prefix suite selection can miss test files that live outside the matched directory. Use
`coverage:patch:full` to reproduce the exact merged CI gate.

**Reads committed changes only.** The command uses `git diff base...head`, so uncommitted edits are
invisible. Commit your work before running.

**Web-init suites** (`playwright-helpers`, `backend-data-stores`, `web-integration`) are included when web-init is
present (`.initialized` contains `"web"` and `.env` exists); they are skipped with a loud warning
otherwise. Files whose _every_ matching suite requires web init (e.g. `playwright/helpers/auth.mts`
or `backend/data-stores/foo.ts`) are
explicitly flagged as not verified locally — run `./dev/initialize web && source .env` to include
them.

Setup and documentation inputs (`**/vitest.setup*.mts`, `docs/**`, `.agents/**`, and other Markdown)
are reported separately as uninstrumented local coverage inputs and are not treated as uncovered
source. Setup files under a suite-owned path still select that suite so setup-only changes are
exercised; setup files outside any suite-owned path and Markdown-only changes remain diagnostic-only.
Use `pnpm run coverage:patch:full` when source-code coverage also needs to be verified.

**Limitations inherited from `coverage:patch:full`:**

- `web/components/**` coverage is under-reported locally because the `web-storybook-browser` project
  runs only in CI.

**One signed suite** (when you want to run one specific registered local suite):

```bash
pnpm run coverage:suite -- <suite>
pnpm run coverage:patch --artifacts coverage
```

`coverage:suite` clears only `coverage/<suite>`, runs the suite's exact ordered Vitest projects and
scope, and stamps its manifest immediately. Use `--output <artifacts-dir>` to choose another
artifact root. `test:web-api:coverage` delegates to the registered `web-api` suite and requires
`./dev/initialize web`.
