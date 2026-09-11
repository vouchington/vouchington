# Coverage Gates

[Back to CI Reference](ci.md#coverage-gates)

Patch coverage below threshold is a pull-request blocker. [`.coverage-rules.yml`](../../.coverage-rules.yml) contains first-match-wins patch thresholds and exemptions, plus a `scope` block that activates `coverage-check`'s missing-coverage detection: a changed file under a positive-threshold rule that has no LCOV record at all — not merely low coverage — is reported as missing rather than silently passing. Each successful producer uploads only its sparse line coverage for the exact pull-request diff, with a self-described partition manifest. The `test-coverage` job in [`ci.yml`](../../.github/workflows/ci.yml) validates complete producer partitions, merges those sparse reports, and runs one `coverage-check check` against the same base and head SHAs.

The Actions summary reports the merged line coverage for the current PR run plus the patch-threshold table. This is coverage for the suites selected by the PR, not a complete repository total. Only patch thresholds affect the result. On failure, the job log and sticky PR comment list the uncovered files and line ranges; a passing run clears an older failure comment. If every coverage producer is skipped, the gate exits successfully without writing a meaningless empty summary.

The base SHA is used only to identify changed patch lines. CI does not read a historical coverage baseline, compare total coverage with `main`, or persist coverage history. Reusable test workflows called by `main-*.yml` default `publish_coverage` to false, and `ci.yml` enables it only for pull requests, so main workflows do not publish orphaned LCOV. The GitHub artifact fallback transport remains a same-run handoff for PR LCOV and Vitest blobs; it is not coverage history.

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

| Scope                     | Min patch coverage |
| ------------------------- | -----------------: |
| `cloudflare-worker/**`    |               100% |
| `email-templates/**`      |               100% |
| `lambdas/**`              |               100% |
| `static-code-analysis/**` |                 0% |
| `ts-shared/**`            |               100% |
| `web/lib/api/**`          |               100% |
| `backend/scripts/**`      |                 0% |
| `backend/**`              |                95% |
| `web/**`                  |                80% |
| Other                     | informational only |

To browse current coverage locally, run `./ci/coverage-artifacts.sh html` after collecting LCOV artifacts.
