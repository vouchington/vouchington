# CI Reference

Full map of every CI check: workflow file, config, scope, and coverage rules. The hand-maintained
Mermaid diagrams (Always run, Pull requests, and Main) are linked from the
[Workflow automation map](../../.github/workflows/reference-workflow-automation-map.md); generate
an exact workflow-only graph with `pnpm run ci:topology --format mermaid --workflow
.github/workflows/ci.yml`. For local commands see [tests.md](tests.md).

AST-grep scans honor the severity declared in each rule: errors block CI and warnings report staged
cleanup work. Entrypoints must not use a bare `--error`, which would promote warning rollouts.

Every CI job targets around 8 minutes of execution time via fewer, longer-running shards; 10
minutes is a hard performance ceiling, not a timeout or CI failure threshold. The read-only
[`ci-job-runtime-audit.mts`](../../ci/ci-job-runtime-audit.mts) command is a thin wrapper over
`vouchington-tooling/gha-runtime-audit`. It checks successful jobs in each workflow's 10 most recent
completed in-scope runs: `CI` pull requests targeting `main` and `Main CI (*)` pushes on `main`.
[`ci.yml`](../../.github/workflows/ci.yml) itself runs on every pull-request base, including stacked
PRs whose literal base is not `main` ([stacked-prs](../../.agents/skills/stacked-prs/SKILL.md));
the audit's main-targeting sample is narrower than that trigger so the 10-run horizon stays comparable.
It retains up to the latest five successful executions for each exact job name within that horizon; it
does not claim exhaustive history. The scheduled
[`ci-job-runtime.md`](../prompts/scheduled/ci-job-runtime.md) prompt turns the highest-ranked breach
into one issue or an update to an existing issue.

CI log quality is audited separately with the
[`review-ci-logs` skill](../../.agents/skills/review-ci-logs/SKILL.md). It samples the same core
10-run horizon plus recent repository-wide failures, ranks downloaded log-archive entries by
uncompressed size, and separates real failures from source echo, downstream cascades, necessary
diagnostics, advisories, and volume-only output. The scheduled
[`ci-log-quality.md`](../prompts/scheduled/ci-log-quality.md) iteration selects one bounded,
diagnostics-preserving fix PR. Use the runtime prompt for duration breaches and
[`transient-retry.md`](../prompts/scheduled/transient-retry.md) for retry fingerprint policy.

The July 25, 2026 scheduled audit found the largest safe log-quality target in `Main CI (backend)`
`build / build / build`: run `30157716207` emitted an 8,557-line, 1,691,436-byte build step while
reporting one actionable Trivy finding, `find-my-way` `CVE-2026-47219`, with fixed version `9.7.0`.
The image gates now retain full Trivy tables and SBOMs in one-day `trivy-*` artifacts, write tables
with `--output`, and print only complete nonzero vulnerability blocks to the live log and step
summary. Scanner errors remain distinct annotations, while clean scans stay quiet.

Every `docker/build-push-action` and `docker/bake-action` step sets
`BUILDX_METADATA_PROVENANCE: disabled`. Without it, the actions' `Metadata` log group printed the
full `buildx.build.provenance` object, about 670 lines per image, around a digest and image name
that no workflow reads. The setting changes only the metadata file and log, not the build output.
`cache-policy.test.mts` requires it on every such step in a workflow or composite action.

CI is expensive — this includes GitHub Actions artifact and cache storage. The repo-level artifact and log retention setting (Settings → Actions → General) is **3 days**. Every workflow artifact requests the literal `retention-days: 1`; `artifact-retention-policy.test.mts` rejects every upload block that omits the one-day value or substitutes another literal or an expression. The repository setting itself stays at 3 days: it is what keeps `fix-main.yml`'s 48-hour source-run staleness bound diagnostic — any escalation that survives that bound still has fetchable logs. GitHub silently caps per-upload values to the repository setting, so verify the live value through the versioned `GET /repos/{owner}/{repo}/actions/permissions/artifact-and-log-retention` API before changing the repository setting. Inter-job blobs (`vitest-blob-*`, `coverage-*` lcov) are explicitly deleted by the reusable `ci-tests-processing.yml` fan-in once consumed, so they do not linger even for their one-day retention, but that processing step only runs on fully-green `ci.yml` runs; area workflows leave their blobs for the scheduled sweep.

[cleanup-artifacts.yml](../../.github/workflows/cleanup-artifacts.yml) immediately deletes delete-classified artifacts inside six Main CI push workflows (checks, backend, cloudflare-worker, lambdas, storybook, and web). Each main-branch producer calls the reusable cleanup only from its terminal fan-in, after all required same-run consumers and terminal jobs succeed or legitimately skip; the caller passes its own `github.run_id`, so no delayed external `workflow_run` cleanup can overlap a later attempt. Pull-request `CI` never receives `actions: write` for cleanup because its workflow definition and helpers come from the pull-request revision; a same-repository bot could edit any trust gate declared there. Pull-request runs and successful runs from any other workflow wait for the trusted scheduled sweep. Every six hours, that sweep deletes delete-classified artifacts only when their artifact `created_at` is older than 6 hours and their producing run concluded exactly `success` or `cancelled`. This is an eligibility threshold plus sweep cadence, not a six-hour grace window after cancellation. An unavailable/null run lookup is skipped for that sweep and retried on the next one; if it later resolves `success` or `cancelled`, it is eligible then. `failure`, `timed_out`, `action_required`, known unknown/unrecognized, and every other known conclusion are never swept and remain until GitHub expiration, because reruns may need their same-run handoffs; see [AUTHORING.md § Artifact Rerun Safety](../../.github/workflows/AUTHORING.md#artifact-rerun-safety). Which artifact name prefixes are kept (`next-static-*`) versus deleted (including the same-run `code-review-payload` handoff) is defined once in [ci/cleanup-artifacts-patterns.json](../../ci/cleanup-artifacts-patterns.json) for both the dependency-free in-run cleanup and the TypeScript sweep; a guard test fails if any real `upload-artifact` name in the workflows matches neither list. Docker build record uploads are disabled with `DOCKER_BUILD_RECORD_UPLOAD: 'false'` on the build workflows, so `.dockerbuild` records are no longer kept. Trivy upload artifacts stay enabled because they also carry the scan tables and SBOM outputs.

Keep workflow triggers narrow, reproduce failures locally before rerunning, and keep tests fail-fast-ish (`--bail=3` for Vitest; `maxFailures: CI ? 3 : undefined` for Playwright). The stacked-PR exception is [`ci.yml`](../../.github/workflows/ci.yml): its `pull_request` trigger must not set `branches` or `branches-ignore`, because a `branches: [main]` filter races at `gh stack submit` ([github/gh-stack#425](https://github.com/github/gh-stack/issues/425)) and skips mid-stack PRs. The `CI` and `Gitleaks` required checks and every area workflow also subscribe to `merge_group` checks requested; `ci.yml` queue runs use the existing credential policy, start every Vitest job, classify docs-only changes across the whole group, and scan the merge group's base-to-head range. Other workflows keep their path and branch filters. Playwright, web integration, and Docker image build filters should skip Markdown-only, Vitest-only, test-helper-only, and Storybook-only changes on both pull requests and `main` pushes unless the changed files are directly owned by that workflow. Direct `node_modules` caches and `actions/setup-node` package-manager cache helpers are not allowed. Ephemeral GitHub-hosted jobs may cache the pnpm store, Playwright browsers, and shared web test runtime output through the explicit, SHA-pinned `actions/cache` policy in the [GitHub Actions checklist](../checklists/github-actions.md).

Local development and the Harness dispatcher's reused worktree preserve local binaries and `node_modules` across runs, so setup must assume a dirty workspace and run checkout cleanup/version checks; GitHub-hosted CI runners start from a clean checkout every job and have no persisted tree to reconcile. Persistent dependency setup stores a successful dependency/platform provenance stamp under root `node_modules`; on a populated tree, a missing or changed stamp, or an invalid required workspace link, forces pnpm's script-free and strict reconciliation passes before a new stamp is written. That reconciliation performs exactly two installs: a script-free pass followed by a strict pass. If the strict pass still reports pending builds, one generic recursive pending rebuild completes them; setup does not add a third install or special-case individual packages. Matching warm state receives one ordinary install. An absent dependency tree (for example right after the Harness dispatcher's clean checkout) has nothing to reconcile, so it takes a single ordinary install and stamps on success, falling back to the two-pass reconciliation only if that install still leaves an invalid workspace link. Static analysis remains stricter and performs unconditional reconciliation so same-input native binary corruption cannot leak into typecheck.

Tracked repository hook payloads exit before doing work when `GITHUB_ACTIONS=true`; explicit workflow
setup actions remain the sole owners of CI dependency setup. Local developer and agent hook behavior
is unchanged. Husky's generated trampoline can still start and source its initialization before the
tracked payload returns, and this guard does not affect non-Husky hooks.
Checkout-only aggregate and result gates must not spend their bounded budget reconciling dependencies
after a branch switch: they aggregate results that earlier steps already made available.

Cache keys that use `hashFiles` must target source files and manifests rather than broad directories, and package source globs must stay scoped to first-party package/source paths so dependency trees are not traversed while keys are evaluated. Web-stack test jobs must clear Next.js runtime output and Wrangler/Miniflare state before tests because stale caches have caused false failures; only explicit performance caches such as `web/.next/cache` may be restored, and those keys must invalidate often. Vouchington image workflows build validation-local images. Backend uses one bounded Bake invocation per job for either API plus worker-cpu or all three images, so the selected targets share one cache-busted builder solve without a remote cache. Web alone reads and writes its GHA cache. Any repository-independent remote-cache or performance design is owned by a separate initiative (formerly filed as jonathanong/filaments#10864). Private infrastructure owns production ECR image publication.

The `static-web` check produces one production-profile standalone web and Cloudflare Worker build
for the web integration and Playwright jobs in the same workflow run. The build action stores only
runtime output under an exact run, attempt, commit, OS, and architecture cache key. Each consumer
validates the run-bound manifest and runtime tree, then runs the same local build if the cache is missing or
incomplete. Standalone multi-shard test workflows produce the cache before their matrix fans out;
a standalone single-shard run builds directly in its test job. CI browser
assets use the same-origin Cloudflare Worker route, so per-job ports do not enter the shared build.
The deployable Docker image has its own build and is outside this test cache.

Trusted main-branch web image publication keeps `SENTRY_AUTH_TOKEN` optional. A configured token
enables Sentry release creation and source-map upload during the image build; without one, the
validated image still publishes to GHCR without source maps. The Docker smoke and Trivy gates do
not depend on this optional integration. See the [deploy and release workflow reference](../../.github/workflows/reference-deploy-and-release.md).

GitHub-hosted runners are ephemeral and single-job-per-VM, so repository workflows do not use
shared-host admission locks, host-pressure diagnostics, or deterministic runner port slices.
`next build` still caps its page-data worker pool from the smaller positive physical or cgroup
memory limit (`experimental.cpus`) so a constrained runner does not size from the enclosing host.

Repository-owned Node test listeners dynamically allocate plain or Fetch-safe ephemeral ports
through [`@ts-shared/utils/ephemeral-ports`](../../ts-shared/utils/ephemeral-ports.mts)'s
`listenOnEphemeralPort()`. Docker callers normally let Docker assign the host-side port; the
few in-job browser consumers that need an explicit reservation use
[`ci/allocate-browser-safe-ports.py`](../../ci/allocate-browser-safe-ports.py) immediately before
binding. This is in-job coordination, not cross-job runner scheduling.

Repository automation dispatches fire-and-forget sessions through Auto Harness when the
default-off master and per-surface gates are exactly `true`. Callers retain authorization,
freshness, transient retry, deduplication, prompt rendering, and immediate failure reporting; the
trusted-host agent owns its narrowly authorized draft PR, existing-PR update, or comment. Every
mutation-capable prompt revalidates live trigger and exact-head state immediately before writing.
The canonical workflow contract is [Auto Harness automation](../../.github/workflows/reference-harness-automation.md),
with accepted residuals and the operator-authenticated incident-response drain control in the
[security boundary](../../.github/workflows/reference-harness-automation-accepted-risk.md).

Automation Fix Main revalidates the same completed source attempt before prompt transfer and
needs-human escalation. A queued, running, or completed rerun suppresses obsolete dispatch,
duplicate-issue comments, and escalation. Uncatalogued genuine transients still require a classifier
with a real-log fixture and counterfixtures; a successful manual rerun alone cannot satisfy
completion. The direct `static-checks / static-web` production-build watchdog fingerprint is
catalogued separately as `main-web-static-build-watchdog-timeout` (`maxAttempts: 1`); its detailed
markers and look-alikes are in [Classifying Transient Infrastructure Failures](reference-ci-classifying-transient-infrastructure-failures.md).

When the merge queue removes a pull request because its merge-group CI failed or timed out,
[Merge Queue Ejection](../../.github/workflows/merge-queue-ejection.yml) dispatches an Auto Harness
triage session from `main`. It fixes a flaky test in a new PR, files a CI or architecture issue, or
comments its analysis on the ejected PR; it never changes that PR. See
[Auto Harness automation](../../.github/workflows/reference-harness-automation.md#completion-specific-safeguards).

[`plan-completion.yml`](../../.github/workflows/plan-completion.yml) runs one retained snapshot after
every `main` push. It paginates current open Plans and their timeline PR candidates, re-reads each
candidate's current body/state and each Plan before writing, then updates only its
`github-actions[bot]` marker comment. Snapshot read batches are concurrency-bounded by the Node-only
[batch mapper](../../ci/plan-completion-batch.mts), preserve discovery order, and stop before any
comment write if a read fails. Plan titles use the validator's case-insensitive `Plan:` convention
during both discovery and revalidation. The advisory never edits a PR body or closes a Plan; a clear
marker means only that the snapshot found no current warning, so planned-but-unopened work still
needs a human audit. GitHub suppresses downstream pushes made with `GITHUB_TOKEN`; supported human
and interactive merges already produce the required main-push event.

## CI behavior references

- <a id="dependency-bot-review-and-main-push-ci"></a>[Dependency bot review and main push CI](reference-ci-standalone-workflow-checks.md#dependency-bot-review-and-main-push-ci)

<a id="area-test-suites"></a>CI never selects individual test files. In `ci.yml`, `detect-changes` path filters ([`ci-path-filters.yml`](../../.github/ci-path-filters.yml) and [`ci-runtime-path-filters.yml`](../../.github/ci-runtime-path-filters.yml)) decide which area jobs start, and every started job runs its area's full suite: each owning Vitest project ([VITEST.md](../../.github/workflows/VITEST.md)) or every Playwright spec. A pull request that changes `.github/workflows/**` or `.github/actions/**` starts every area job, docs-only pull requests skip them, and merge groups start every Vitest job. Static-analysis failures suppress the tests and Docker image validation they gate; every test, Playwright suite, and Docker validation build otherwise starts as soon as its static gates pass and never waits on another test. The required `tests` and `build` fan-in checks still report every failure. Main push workflows run independently with `cancel-in-progress: false`. There is no cross-run producer-result reuse, and CI never reads PR labels.

[`ci.yml`](../../.github/workflows/ci.yml) runs only on `opened`, `synchronize`, and `reopened` pull-request events, so marking a draft ready for review, or converting a PR back to draft, starts no CI run. A new pull-request run cancels the obsolete run for the same PR.

<a id="area-workflows"></a>The per-area workflows [`static`](../../.github/workflows/static.yml), [`backend`](../../.github/workflows/backend.yml), [`web`](../../.github/workflows/web.yml), [`cloudflare-worker`](../../.github/workflows/cloudflare-worker.yml), [`lambdas`](../../.github/workflows/lambdas.yml), and [`tooling`](../../.github/workflows/tooling.yml) run on the same pull-request events and on merge groups, in parallel with `ci.yml` until the `Main` ruleset requires their gates instead of `tests` and `build`. `static` runs the full repository static analysis on every change, docs-only changes included, and has no `changes` job: a `needs:` on that reusable job would hide its typecheck steps from the no-mistakes `tsconfig-gate-coverage` rule. Every other area starts with a `changes` job ([`ci-detect-changes.yml`](../../.github/workflows/ci-detect-changes.yml)) that selects its area from the same path filters: a workflow or action change selects every area, a docs-only change selects none, and Storybook belongs to `web`. A selected area runs every suite it owns in full, gated by its area static checks; credentialed suites skip on untrusted pull requests, and Storybook skips on them unless a dependency bot opened the PR. The job named after the area is its required check and passes when the area is skipped. Its `coverage` job ([`ci-area-coverage.yml`](../../.github/workflows/ci-area-coverage.yml)) blocks on patch coverage of the files `.coverage-rules.yml` assigns to that area, and its `codecov` job uploads each suite's full LCOV under its own carryforward flag (informational; see [`codecov.yml`](../../codecov.yml)). Each concurrency group starts with a literal area prefix and cancels only superseded pull-request runs. [`nightly.yml`](../../.github/workflows/nightly.yml) calls every area workflow daily and on manual dispatch; `changes` selects every area for those events, so each suite runs in full at the `main` tip.

## Coverage references

- <a id="coverage-provenance-and-transport"></a>[Coverage Provenance and Transport](reference-ci-coverage-provenance-and-transport.md)

The main-only protected Storybook and internal-documentation artifacts are keep-classified for
their one-day retention because the trusted infrastructure publishers consume the exact completed
source-run artifacts after the source workflows complete. Each artifact is named with its source
run ID and attempt; infrastructure selects it by immutable artifact ID instead of checking out and
executing product source.

## CI operations references

- <a id="workflow-topology-contracts"></a>[Workflow Topology Contracts](reference-ci-workflow-topology-contracts.md)
- <a id="diagnosing-binary-download-failures"></a>[Diagnosing Binary Download Failures](reference-ci-diagnosing-binary-download-failures.md)
- <a id="classifying-transient-infrastructure-failures"></a>[Classifying Transient Infrastructure Failures](reference-ci-classifying-transient-infrastructure-failures.md)
- <a id="static-analysis-static-code-analysisyml"></a>[Static Analysis (`static-code-analysis.yml`)](reference-ci-static-analysis-static-code-analysis-yml.md)
- <a id="standalone-workflow-checks"></a>[Standalone Workflow Checks](reference-ci-standalone-workflow-checks.md)
- <a id="destructive-manual-workflows"></a>[Destructive Manual Workflows](reference-ci-destructive-manual-workflows.md)
- <a id="ci-job-conditions"></a>[CI Job Conditions](reference-ci-ci-job-conditions.md)
- <a id="test-workflows"></a>[Test Workflows](reference-ci-test-workflows.md)
- <a id="coverage-gates"></a>[Coverage Gates](reference-ci-coverage-gates.md)
- <a id="workspace-cross-reference"></a>[Workspace Cross-Reference](reference-ci-workspace-cross-reference.md)
- <a id="adding-a-trustedcredentialed-ci-job"></a>[Adding a Trusted/Credentialed CI Job](reference-ci-adding-a-trusted-credentialed-ci-job.md)
- <a id="ci-job-timeout-budgets"></a>[CI Job Timeout Budgets](reference-ci-ci-job-timeout-budgets.md)
