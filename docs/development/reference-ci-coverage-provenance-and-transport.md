# Coverage Provenance and Transport

[Back to CI Reference](ci.md#coverage-provenance-and-transport)

Every uploaded coverage payload is a patch projection with `coverage-check` manifest schema v2.
[`ci/coverage-manifest.mts`](../../ci/coverage-manifest.mts) is a thin adapter: it supplies a suite
descriptor, run identity, base/head SHAs, and the producer partition. The upstream package owns Git
patch discovery, sparse LCOV projection, schema serialization, payload validation, partition
validation, multi-source selection, and atomic canonical output. A manifest binds repository,
suite/projects, revision and run attempt, collector settings, LCOV digest, patch algorithm and
base/head, changed-line digest, and producer group/index/total. Empty patch LCOV and an empty source
root are valid for a successful producer with no changed lines in its report.

[`ci/coverage-suites.mts`](../../ci/coverage-suites.mts) retains static collector descriptors and
maps dynamic backend/web suite names to self-described partitions. It does not enumerate expected
shards for fan-in. [`ci/prepare-coverage-artifacts.mts`](../../ci/prepare-coverage-artifacts.mts)
passes the two transport roots and Filaments descriptor resolver to
`preparePatchCoverageArtifacts`; `coverage-check` selects the newest attempt per suite, deduplicates
identical transport copies, rejects conflicts and unknown suites, and proves every producer group
contains exactly indices `1..total`. Filaments also passes the groups selected by the current
successful jobs. A required group may reuse a complete earlier attempt; an unselected group is
pruned only when every selected contribution predates the current attempt, while missing required
groups and unselected current-attempt contributions fail closed. Omitting that selection preserves
the strict behavior that validates every selected group. Filaments supplies only its
orchestration-specific descriptors.

Coverage and Vitest-blob payloads travel over GitHub artifacts only; there is no S3 transport, no
presign/discover bootstrap job, and no AWS credential grant. See
[workflow coverage docs](../../.github/workflows/COVERAGE.md#provenance-and-transport) for the
upload-attempt/retry step chain and budget.
[`ci/artifact-upload-outcome.mts`](../../ci/artifact-upload-outcome.mts) fails the producer with
`COVERAGE_TRANSPORT_EXHAUSTED` only when neither upload attempt persisted the complete pair; that
marker text is a live cross-commit log contract read by the transient-retry classifier, so it does
not change independently of the classifier. Fan-in
control and GitHub-artifact probes use the published GHA helper through
[`ci/download-optional-run-artifacts.sh`](../../ci/download-optional-run-artifacts.sh) to report
typed availability and bounded warnings without a tolerated failing step. PostgreSQL schema is
blob-only. Producer workflows use the leaf
[`upload-coverage-pair`](../../.github/actions/upload-coverage-pair/action.yml) and
[`upload-vitest-blob`](../../.github/actions/upload-vitest-blob/action.yml) actions to centralize
only the fixed artifact mechanics. Producer callers retain every stable step ID, cancellation
condition, nonblocking transport outcome, timeout cap, and permission hardening around each
attempt.

`test-coverage` downloads GitHub fallback artifacts, which legitimately span rerun attempts. The
upstream selector validates all candidates before choosing the newest complete partition for every
producer group. It then applies the current successful-job group selection: a failed-only rerun
can reuse successful earlier required groups, discard wholly stale groups no longer selected, and
reject incomplete required or current-attempt unexpected groups. Canonical sparse LCOV enters the
merge only after repository, revision, run, patch, collector, payload, suite, producer-selection,
and partition validation. Policy and local commands live in
[workflow coverage docs](../../.github/workflows/COVERAGE.md).

Vitest diagnostic reports use a separate, repository-owned `vitest-blob-manifest:v1` contract. Each
GitHub fallback artifact contains exactly the manifest and one `${suite}.json` regular file; the
manifest binds repository, revision, run ID, attempt, suite, byte length, and SHA-256. Archive
names and file types are allowlisted before bytes are materialized. The report fan-in validates the
download root as a whole. A known malformed-root failure rejects it with a stable warning and
contributes no partial candidates. Within a valid root, fan-in ignores only valid unexpected
earlier-attempt suites from the same run/revision, selects the latest attempt for every exact
current expectation, accepts identical same-attempt copies, rejects conflicts and missing suites,
and atomically replaces the canonical Vitest merge directory. An invalid root is advisory when no
suites are expected because no report can enter canonical output. See
[Vitest CI Mapping](../../.github/workflows/VITEST.md#vitest-ci-mapping)
and [artifact rerun safety](../../.github/workflows/reference-artifact-rerun-safety.md).
