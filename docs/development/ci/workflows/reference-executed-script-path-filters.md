# Executed Script Path Filters

[Back to Workflow Authoring Reference](AUTHORING.md#executed-script-path-filters)

- Rule: a tracked file that a path-gated job's steps reference must trigger that job. Editing a
  script without running the job that executes it lets a broken script merge. `ci/**` routes only to
  the `tooling` filter, so a `ci/` script needs its own entry in the filters that gate its jobs.
- `ci-path-filters.job-references.test.mts` enforces the rule. It derives each job's gates from
  `ci-detect-changes.yml` (job outputs, the `areas` step, and each step's `some` or `every`
  quantifier), follows reusable workflows and local composite actions, and matches globs like
  dorny/paths-filter (picomatch with `dot: true`). A failure prints
  `<area>.yml#<job>: <file> (via <workflow > action>)`.
- The check is first level only: it reads files named in step `run`, `with`, and `env`, and in job
  `with` and `env`, plus those of called workflows and actions. It does not follow imports or
  source calls inside a referenced script, because the repository has no owned AST parser. Review
  the filters by hand when a script starts calling another script.
- Routing: shared step scripts used by jobs in two or more areas go in `workflow-action-changes`
  (`ci/with-node-test-options`, `ci/artifact-upload-outcome.mts`, `ci/coverage-artifacts.sh`,
  `ci/vitest/shard-total.mts`, `ci/make-shard-matrix.sh`); they change rarely, so also selecting the
  image jobs is acceptable. Image-only scripts go in the matching `build-*` filter, its `runtime-build-*`
  twin, and its `build-*-infra` filter. Single-area scripts go in that area's filters:
  `playwright` and `runtime-playwright` for the Playwright setup and bounded-test scripts, and
  `backend` for `ci/backend-unit-pg-waits.sql`. Keep each primary list and its `runtime-*` brace
  pattern in sync.
- The web image smoke step runs `web/test-helpers/localization-smoke-backend.mts` and
  `web/test-helpers/compile-localization-smoke-catalog.mts`. `runtime-build-web` still excludes
  test-only helpers (subdirectories, `*.ts`, `*.tsx`, and `vitest.setup.*.mts`) but no longer
  excludes top-level `web/test-helpers/*.mts` scripts, so these two select the image jobs.
  `build-web-infra` lists them.
