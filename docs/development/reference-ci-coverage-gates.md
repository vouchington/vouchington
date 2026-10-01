# Coverage Gates

[Back to CI Reference](ci.md#coverage-gates)

Patch coverage below threshold is a pull-request blocker. It is not checked in merge groups: a merge group's diff is the pull request's diff. [`.coverage-rules.yml`](../../.coverage-rules.yml)
contains first-match-wins patch thresholds and exemptions. Each positive rule belongs to one area.
The selected area uploads full LCOV from its owned suites, then its `coverage` job runs
`coverage-check` only with that area's rules. A changed file under a positive-threshold rule with no
LCOV record is reported as missing rather than silently passing.

The base SHA identifies patch lines only. The gate neither reads a historical baseline nor persists
coverage history. Full LCOV is a same-run artifact handoff retained for one day. Codecov receives
that LCOV as informational evidence and never gates a PR or merge group. A skipped area passes its
required gate without creating a coverage report.

Every selected coverage producer attempts two bounded GitHub artifact uploads. A successful suite
must persist its full LCOV through one attempt or fail its owning area; rerun that producer when
the upload is the first failure.

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

## Area patch coverage

Each area workflow (for example [`backend.yml`](../../.github/workflows/backend.yml)) has a `coverage` job that calls [`ci-area-coverage.yml`](../../.github/workflows/ci-area-coverage.yml) on pull requests only. Its result feeds the area's required gate, so low patch coverage blocks the pull request. In a merge group, on nightly and on manual dispatch the job is skipped and the gate passes it, because the merge-group diff equals the pull request's diff and a second check would only add a job per area and an ejection path. Suites still upload full LCOV and the informational `codecov` job still runs in merge groups, which keeps Codecov's `main` baseline current.

- **Input:** the `lcov-full-*` artifacts its own suites published in the same run. Each suite retries its upload once and fails with `FULL_LCOV_EXHAUSTED` when neither attempt persists, so an empty download is a broken upload and fails the job.
- **Diff:** `HEAD^1..HEAD`. A pull-request merge commit has the base as its first parent.
- **Rules:** every positive-threshold rule in `.coverage-rules.yml` names its owning `area`. [`ci/coverage-area-rules.mts`](../../ci/coverage-area-rules.mts) keeps the owning area's thresholds and zeroes every other positive rule in place. A file that several areas' suites exercise therefore blocks exactly once, in its owner's gate, and first-match order still lets a narrower rule owned by another area shadow a broader one.
- **When it runs:** only on pull requests, after the area's static checks succeed and no coverage-producing suite failed or was cancelled. A failed suite already fails the gate, and its partial LCOV would only add a misleading coverage failure.

`./ci/coverage-artifacts.sh area-check` runs the same check locally when `coverage-artifacts/` holds the area's full LCOV and `COVERAGE_AREA`, `COVERAGE_BASE` and `COVERAGE_HEAD` are set.
