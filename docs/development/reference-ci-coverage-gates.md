# Coverage Gates

[Back to CI Reference](ci.md#coverage-gates)

Patch coverage below threshold is a pull-request blocker. [`.coverage-rules.yml`](../../.coverage-rules.yml) contains first-match-wins patch thresholds and exemptions, plus a `scope` block that activates `coverage-check`'s missing-coverage detection: a changed file under a positive-threshold rule that has no LCOV record at all — not merely low coverage — is reported as missing rather than silently passing. Each successful producer uploads only its sparse line coverage for the exact pull-request diff, with a self-described partition manifest. The `test-coverage` job in [`ci.yml`](../../.github/workflows/ci.yml) validates complete producer partitions, merges those sparse reports, and runs one `coverage-check check` against the same base and head SHAs.

The Actions summary reports the merged line coverage for the current PR run plus the patch-threshold table. This is coverage for the suites selected by the PR, not a complete repository total. Only patch thresholds affect the result. On failure, the job log and sticky PR comment list the uncovered files and line ranges; a passing run clears an older failure comment. If every coverage producer is skipped, the gate exits successfully without writing a meaningless empty summary.

The base SHA is used only to identify changed patch lines. Neither gate reads a historical coverage baseline, compares total coverage with `main`, or persists coverage history; Codecov's carryforward flags are the informational history. Reusable test workflows default `publish_coverage` and `publish_coverage_pair` to false. Area workflows enable `publish_coverage`, and `ci.yml` enables both only for pull requests, so `main-*.yml` workflows publish no orphaned LCOV. GitHub artifacts are a same-run handoff for LCOV and Vitest blobs; they are not coverage history.

Every coverage producer, regardless of trust level, attempts two bounded GitHub artifact uploads
independently. A failed test run may emit no LCOV, but a successful test producer must persist a
complete sparse-LCOV/manifest pair through one of those two ordered fallback attempts or fail in
that producer with `COVERAGE_TRANSPORT_EXHAUSTED`. `ci/prepare-coverage-artifacts.mts` distinguishes
invalid or missing artifacts from genuinely uncovered patch lines. Rerun the producer rather than
the aggregator when transport exhaustion is the first failure.

Same-repository Dependabot and Renovate PRs run coverage without publishing static previews. If a
maintainer pushes a commit to one of those PRs, the immutable PR author classification still keeps
it untrusted, while the new head diff is covered through GitHub artifacts. Pure dependency-update
PRs commonly have no instrumentable changed lines; their valid empty sparse payloads pass without
transporting full reports that the patch gate would discard.

Moved files do not require tests solely because their path changed: `coverage-check` uses rename-aware Git diffs. Edited lines inside a move remain patch lines and must meet the matching threshold.

| Scope                                                                      | Min patch coverage | Owning area         |
| -------------------------------------------------------------------------- | -----------------: | ------------------- |
| `cloudflare-worker/scripts/wrangler/runtime.mts`, `lambdas/dev-server.mts` |               100% | `tooling`           |
| `cloudflare-worker/**`                                                     |               100% | `cloudflare-worker` |
| `lambdas/**`                                                               |               100% | `lambdas`           |
| `email-templates/**`                                                       |               100% | `backend`           |
| `static-code-analysis/**`                                                  |                 0% | —                   |
| `ts-shared/**`                                                             |               100% | `tooling`           |
| `web/lib/api/**`                                                           |               100% | `web`               |
| `backend/scripts/**`                                                       |                 0% | —                   |
| `backend/**`                                                               |                95% | `backend`           |
| `web/**`                                                                   |                80% | `web`               |
| Other                                                                      | informational only | —                   |

To browse current coverage locally, run `./ci/coverage-artifacts.sh html` after collecting LCOV artifacts.

## Area patch coverage

Each area workflow (for example [`backend.yml`](../../.github/workflows/backend.yml)) has a `coverage` job that calls [`ci-area-coverage.yml`](../../.github/workflows/ci-area-coverage.yml) on pull requests and merge groups. Its result feeds the area's required gate, so low patch coverage blocks both the pull request and its merge-queue entry.

- **Input:** the `lcov-full-*` artifacts its own suites published in the same run. Each suite retries its upload once and fails with `FULL_LCOV_EXHAUSTED` when neither attempt persists, so an empty download is a broken upload and fails the job.
- **Diff:** `HEAD^1..HEAD`. A pull-request merge commit and a merge-group squash commit both have the base as their first parent.
- **Rules:** every positive-threshold rule in `.coverage-rules.yml` names its owning `area`. [`ci/coverage-area-rules.mts`](../../ci/coverage-area-rules.mts) keeps the owning area's thresholds and zeroes every other positive rule in place. A file that several areas' suites exercise therefore blocks exactly once, in its owner's gate, and first-match order still lets a narrower rule owned by another area shadow a broader one.
- **When it runs:** only after the area's static checks succeed and no coverage-producing suite failed or was cancelled. A failed suite already fails the gate, and its partial LCOV would only add a misleading coverage failure.

`./ci/coverage-artifacts.sh area-check` runs the same check locally when `coverage-artifacts/` holds the area's full LCOV and `COVERAGE_AREA`, `COVERAGE_BASE` and `COVERAGE_HEAD` are set.
