# CI Reference

Why CI is shaped the way it is. Workflow YAML is the source of truth for triggers, jobs, and
dependencies; `pnpm run ci:topology --format mermaid` renders the exact graph. For local commands see
[tests.md](tests.md), and for the rest of the CI docs see the [CI documentation index](ci/README.md).

## Budgets and cost

Every CI job targets a runtime budget via fewer, longer-running shards; the ceiling is a
performance budget, not a timeout or CI failure threshold. The scheduled
[`ci-job-runtime.md`](../prompts/scheduled/ci-job-runtime.md) prompt turns the highest-ranked breach
of the ceiling into one issue, and the scheduled
[`ci-log-quality.md`](../prompts/scheduled/ci-log-quality.md) prompt selects one bounded,
diagnostics-preserving log fix. Use [`transient-retry.md`](../prompts/scheduled/transient-retry.md)
for retry fingerprint policy and the
[`review-ci-logs` skill](../../.agents/skills/review-ci-logs/SKILL.md) to separate real failures
from source echo, cascades, and volume-only output.

CI is expensive, including GitHub Actions artifact and cache storage, so every artifact and the
repository retention setting are as short as possible. The scheduled
[cleanup-artifacts.yml](../../.github/workflows/cleanup-artifacts.yml) sweep deletes only
delete-classified artifacts from runs that concluded `success` or `cancelled`: failed runs keep
their same-run handoffs because a rerun may need them. Which names are kept or deleted is defined
once in [ci/cleanup-artifacts-patterns.json](../../ci/cleanup-artifacts-patterns.json). See
[Artifact Rerun Safety](ci/workflows/reference-artifact-rerun-safety.md). The weekly
[GHCR cleanup](../../.github/workflows/ghcr-cleanup.yml) keeps images main still reaches and deletes
images from ejected or failed merge groups after a seven day grace period.

Log volume is a cost too, so noise with no reader is suppressed at the source: Valkey runs as a step
container (a service container dumps its full `docker logs` at teardown on every run), pnpm installs
use `--loglevel=warn`, Docker build steps disable buildx provenance metadata, Trivy tables go to
artifacts with only nonzero findings printed, and Storybook's repeated bundler warning prints once.
Each is enforced by a workflow test, so do not undo one to chase a different symptom.

The tooling fork-leak preflight reaches a real backend command client through its shared setup,
even though its generated job uses an in-memory queue. Its workflow therefore needs an
owned disposable Valkey service; passing the generated test assertions alone does not establish
that the process completed without unhandled connection errors.

## Principles

Keep workflow triggers narrow, reproduce failures locally before rerunning, and keep tests
fail-fast-ish (`--bail=3` for Vitest; `maxFailures: CI ? 3 : undefined` for Playwright). Path
filters for Playwright, web integration, and Docker image builds should skip Markdown-only,
Vitest-only, test-helper-only, and Storybook-only changes unless the workflow directly owns the
changed files.

- Hosted CI does not cache the pnpm store or `node_modules`; dependency installs use the runner's
  store directly, without a cache restore path. `actions/setup-node` package-manager caching is also
  disabled. Playwright browsers and shared web test runtime output may use SHA-pinned
  `actions/cache` under the [GitHub Actions checklist](../checklists/github-actions.md).
- Cache keys that use `hashFiles` must target source files and manifests, not broad directories, so
  dependency trees are never traversed while keys are evaluated.
- Web-stack test jobs clear Next.js runtime output and Wrangler/Miniflare state before tests,
  because stale caches have caused false failures. Only explicit performance caches may be
  restored, and their keys must invalidate often.
- Local development and the Harness dispatcher's reused worktree keep binaries and `node_modules`
  across runs, so setup assumes a dirty workspace and reconciles it; GitHub-hosted runners start
  clean every job and have nothing to reconcile.
- Tracked repository hook payloads exit immediately when `GITHUB_ACTIONS=true`: explicit workflow
  setup actions are the sole owners of CI dependency setup.
- Checkout-only aggregate and result gates must not spend their bounded budget reconciling
  dependencies after a branch switch.
- Image workflows build validation-local images with no remote cache (web alone uses the GHA cache),
  so they stay cheap and reproducible. Private infrastructure owns production image publication.
- Optional trusted web image publication takes `SENTRY_AUTH_TOKEN` when present; without it the
  validated image still publishes without source maps, and pull-request and Nightly runs never
  receive the token. A successful deploy dispatch is not deployment evidence; operators verify the
  matching private receiver run
  ([deployment CI/CD flow](../overview/infrastructure/reference-deployment-ci-cd-flow.md#operations-and-failure-handling)).
- GitHub-hosted runners are ephemeral and single-job-per-VM, so workflows use no shared-host locks
  or host-pressure diagnostics. Test listeners allocate ephemeral ports in-job, which is
  coordination within one job, not cross-job scheduling.
- The `static-web` check produces one production-profile web build, cached under an exact run,
  attempt, and commit key, for the web integration and Playwright jobs in the same run. Consumers
  validate the manifest and rebuild locally when the cache is missing.
- AST-grep scans honor each rule's declared severity: errors block CI and warnings report staged
  cleanup work, so entrypoints must not use a bare `--error`. The static AST-grep step also rejects
  Knip export-suppression tags in source comments; explicit runtime loading belongs in Knip entries,
  not source comments.

## Area workflows and test selection

<a id="area-test-suites"></a>CI never selects individual test files. File-level selection was removed,
and bringing it back for pull requests was replayed against recent pull requests and deferred: it
needs a patch-coverage design for partial test runs and out-of-sample evidence for its safety rules,
because each missed test costs a merge-group ejection. Each selected area runs its full owning
Vitest projects or Playwright specs. A workflow or action change selects every area, docs-only pull
requests skip selected areas, and a merge group selects the areas its combined queued range touches.
A pull request selects from its own layer's files; the two scopes differ on purpose
([diff scope](reference-ci-ci-job-conditions.md#change-detection-diff-scope)). Only the nightly
schedule and manual dispatch select every area without a diff. Static-analysis failures suppress
only the tests and Docker validation builds they gate. Main push workflows stay independent with
`cancel-in-progress: false`.

<a id="area-workflows"></a>The per-area workflows run on pull-request
events and merge groups, and their names are the Main ruleset's required gates (see
[.github/workflows/AGENTS.md](../../.github/workflows/AGENTS.md)). `static` runs full static
analysis on every change, docs-only included. Every other area starts with a `changes` job that
selects it from shared path filters, and the job named after the area is the required check and
passes when the area is skipped. Credentialed suites skip on untrusted pull requests, and
Storybook skips on them unless a dependency bot opened the PR.

Native Node coverage and Vitest coverage use the same AST statement representation before their
LCOV artifacts are merged. Physical-line coverage can otherwise count braces, signatures, and
multiline expressions as uncovered even when the owning behavior ran. The published coverage
converter owns that normalization; workflows preserve each native producer's capture and source scope.

Patch coverage is enforced by each area's `coverage` job on pull requests only, over the layer's own
lines (rules in `.coverage-rules.yml`). Each queued entry was already gated at its pull request, and
the combined queued range would charge an entry with other entries' lines and add a job per area and
an ejection path for nothing. Every event still uploads full LCOV, and the informational `codecov`
job sends it under a carryforward flag without gating. Each concurrency group starts with a
literal area prefix and cancels only superseded pull-request runs, and
[`nightly.yml`](../../.github/workflows/nightly.yml) calls every area daily.

The Backend area prepares one migrated PostgreSQL baseline per workflow run for every backend database
consumer: unit shards, trusted provider tests, schema contracts, smoke tests, and EXPLAIN scenarios.
The producer checks SQL safety, staging RSS and retained-relation bootstrap, and the canonical schema
snapshot, then uploads a
short-lived custom-format dump. Each consumer restores that artifact into its isolated PostgreSQL
service before running its checks. Standalone suite dispatches prepare the same baseline themselves.
Dedicated native migration-control scenarios still execute migrations as the behavior under test.
Snapshot validation runs on fresh migration output because PostgreSQL can re-parenthesize equivalent
conditions during dump/restore.

<a id="live-provider-smoke-checks"></a>The Backend area's `test-backend-credentialed` job and the Web
area's `test-playwright-credentialed` job call live providers as informational smoke checks: their
gates do not wait on them, they publish no LCOV, and `.pr-shepherdrc.yml` lists them under
`checks.ignore`. A provider failure is not by itself a regression in this repository, so it must not
eject a queue entry, and no [transient-failure rule](reference-ci-classifying-transient-infrastructure-failures.md)
reruns them because a rerun of a non-gating job gains nothing. The failed job stays red so the
check, the Nightly run, and the Nightly alert still report it. Recorded provider responses replayed
through `createProviderReplay` gate the
same request handling deterministically; see [live-provider smoke checks](tests.md#live-provider-smoke-checks)
for the conversion rules. To add such a job, see
[Adding a Trusted/Credentialed CI Job](reference-ci-adding-a-trusted-credentialed-ci-job.md).

## Automation

Repository automation dispatches fire-and-forget sessions through Auto Harness when the default-off
master and per-surface gates are exactly `true`. Callers keep authorization, freshness, transient
retry, deduplication, and failure reporting; the trusted-host agent owns its narrowly authorized
draft PR, PR update, or comment, and every mutation-capable prompt revalidates live state
immediately before writing. The contract is in
[Auto Harness automation](ci/workflows/reference-harness-automation.md). Accepted residuals are not restated here.

- **Fix Main** accepts push failures from the publisher workflows and schedule/manual failures only
  from the same-repository `Nightly` workflow on `main`. It revalidates the completed source attempt
  before prompt transfer and escalation, and a queued, running, or completed rerun suppresses
  obsolete dispatch. Uncatalogued genuine transients still need a classifier with a real-log fixture
  and counterfixtures; see
  [Classifying Transient Infrastructure Failures](reference-ci-classifying-transient-infrastructure-failures.md).
- **Merge queue ejection** dispatches one queue-wide triage session that groups recent ejections by
  root cause, fixes flaky tests in new PRs, files issues, or comments on ejected PRs, and never
  changes an ejected PR. Replaced or dequeued queue entries leave runs that nothing else cancels, so
  two cancel workflows handle them; see
  [merge queue run cancellation](ci/workflows/reference-merge-queue-run-cancellation.md) for why
  `concurrency:` cannot.
- **Plan completion** ([`plan-completion.yml`](../../.github/workflows/plan-completion.yml)) is an
  advisory snapshot after every `main` push. It updates only its own marker comment and never edits
  a PR body or closes a Plan, so a clear marker means only that no warning was found, and
  planned-but-unopened work still needs a human audit.
- **PR shepherding** configures bot-comment classifiers through
  [`.pr-shepherdrc.yml`](../../.pr-shepherdrc.yml). Vendor notice formats decide suppression, never an
  author's identity alone, and Codecov comments can arrive before coverage uploads finish, so
  coverage checks determine actionable failures. General notice rules belong in pr-shepherd rather
  than repository-local classifiers.

## CI operations references

- <a id="destructive-manual-workflows"></a>[Destructive Manual Workflows](reference-ci-destructive-manual-workflows.md)
- <a id="ci-job-conditions"></a>[CI Job Conditions](reference-ci-ci-job-conditions.md)
- <a id="classifying-transient-infrastructure-failures"></a>[Classifying Transient Infrastructure Failures](reference-ci-classifying-transient-infrastructure-failures.md)
- <a id="adding-a-trustedcredentialed-ci-job"></a>[Adding a Trusted/Credentialed CI Job](reference-ci-adding-a-trusted-credentialed-ci-job.md)
