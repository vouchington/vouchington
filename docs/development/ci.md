# CI Reference

Full map of every CI check: workflow file, config, scope, and coverage rules. The hand-maintained
Mermaid DAG is the [Workflow automation map](../../.github/workflows/reference-workflow-automation-map.md);
generate an exact workflow-only graph with `pnpm run ci:topology --format mermaid --workflow
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

CI is expensive — this includes GitHub Actions artifact and cache storage. The repo-level artifact and log retention setting (Settings → Actions → General) is **3 days**. Every workflow artifact requests the literal `retention-days: 1`, including `ci-state-*` producer-state artifacts used across the draft-to-ready transition; `artifact-retention-policy.test.mts` rejects every upload block that omits the one-day value or substitutes another literal or an expression. The repository setting itself stays at 3 days: it is what keeps `fix-main.yml`'s 48-hour source-run staleness bound diagnostic — any escalation that survives that bound still has fetchable logs. GitHub silently caps per-upload values to the repository setting, so verify the live value through the versioned `GET /repos/{owner}/{repo}/actions/permissions/artifact-and-log-retention` API before changing the repository setting. Inter-job blobs (`vitest-blob-*`, `coverage-*` lcov) are explicitly deleted by the reusable `ci-tests-processing.yml` fan-in once consumed, so they do not linger even for their one-day retention, but that processing step only runs on fully-green `ci.yml` runs.

[cleanup-artifacts.yml](../../.github/workflows/cleanup-artifacts.yml) immediately deletes delete-classified artifacts inside six Main CI push workflows (checks, backend, cloudflare-worker, lambdas, storybook, and web). Each main-branch producer calls the reusable cleanup only from its terminal fan-in, after all required same-run consumers and terminal jobs succeed or legitimately skip; the caller passes its own `github.run_id`, so no delayed external `workflow_run` cleanup can overlap a later attempt. Pull-request `CI` never receives `actions: write` for cleanup because its workflow definition and helpers come from the pull-request revision; a same-repository bot could edit any trust gate declared there. Pull-request runs and successful runs from any other workflow wait for the trusted scheduled sweep. Every six hours, that sweep deletes delete-classified artifacts only when their artifact `created_at` is older than 6 hours and their producing run concluded exactly `success` or `cancelled`. This is an eligibility threshold plus sweep cadence, not a six-hour grace window after cancellation. An unavailable/null run lookup is skipped for that sweep and retried on the next one; if it later resolves `success` or `cancelled`, it is eligible then. `failure`, `timed_out`, `action_required`, known unknown/unrecognized, and every other known conclusion are never swept and remain until GitHub expiration, because reruns may need their same-run handoffs; see [AUTHORING.md § Artifact Rerun Safety](../../.github/workflows/AUTHORING.md#artifact-rerun-safety). Which artifact name prefixes are kept (`ci-state-*`, `next-static-*`, and `browser-port-diagnostics-*`) versus deleted (including the same-run `code-review-payload` handoff) is defined once in [ci/cleanup-artifacts-patterns.json](../../ci/cleanup-artifacts-patterns.json) for both the dependency-free in-run cleanup and the TypeScript sweep; a guard test fails if any real `upload-artifact` name in the workflows matches neither list. Docker build record uploads are disabled with `DOCKER_BUILD_RECORD_UPLOAD: 'false'` on the build workflows, so `.dockerbuild` records are no longer kept. Trivy upload artifacts stay enabled because they also carry the scan tables and SBOM outputs.

Keep workflow triggers narrow, reproduce failures locally before rerunning, and keep tests fail-fast-ish (`--bail=3` for Vitest; `maxFailures: CI ? 3 : undefined` for Playwright). The stacked-PR exception is [`ci.yml`](../../.github/workflows/ci.yml): its `pull_request` trigger must not set `branches` or `branches-ignore`, because a `branches: [main]` filter races at `gh stack submit` ([github/gh-stack#425](https://github.com/github/gh-stack/issues/425)) and skips mid-stack PRs. Other workflows keep their path and branch filters. Playwright, web integration, and Docker image build filters should skip Markdown-only, Vitest-only, test-helper-only, and Storybook-only changes on both pull requests and `main` pushes unless the changed files are directly owned by that workflow. npm caches (`node_modules`, pnpm/npm/yarn stores, `setup-node` cache helpers) are not allowed on self-hosted runners, which already persist them locally. Hosted runners without that persistence (Playwright shards in `tests-playwright.yml`, via the shared `setup-playwright` composite) cache the pnpm store and Playwright browser downloads through `actions/cache` instead, each keyed correctly — the pnpm store on `pnpm-lock.yaml`'s hash, Playwright browsers on the exact resolved `playwright-core` version — see [reference-self-hosted-runner-caching.md](../../.github/workflows/reference-self-hosted-runner-caching.md).

Self-hosted runners should preserve local binaries and `node_modules`, but every run must assume a dirty workspace and run the checkout cleanup/version checks described in [.github/workflows/RUNNERS.md](../../.github/workflows/RUNNERS.md#self-hosted-runner-caching). Persistent dependency setup stores a successful dependency/platform provenance stamp under root `node_modules`; on a populated tree, a missing or changed stamp, or an invalid required workspace link, forces pnpm's script-free and strict reconciliation passes before a new stamp is written. That reconciliation performs exactly two installs: a script-free pass followed by a strict pass. If the strict pass still reports pending builds, one generic recursive pending rebuild completes them; setup does not add a third install or special-case individual packages. Matching warm state receives one ordinary install. An absent dependency tree (for example right after the Harness dispatcher's clean checkout) has nothing to reconcile, so it takes a single ordinary install and stamps on success, falling back to the two-pass reconciliation only if that install still leaves an invalid workspace link. Static analysis remains stricter and performs unconditional reconciliation so same-input native binary corruption cannot leak into typecheck.

Tracked repository hook payloads exit before doing work when `GITHUB_ACTIONS=true`; explicit workflow
setup actions remain the sole owners of CI dependency setup. Local developer and agent hook behavior
is unchanged. Husky's generated trampoline can still start and source its initialization before the
tracked payload returns, and this guard does not affect non-Husky hooks.
Checkout-only aggregate and result gates must not spend their bounded budget reconciling dependencies
after a branch switch: they aggregate results that earlier steps already made available.

Cache keys that use `hashFiles` must target source files and manifests rather than broad directories, and package source globs must stay scoped to first-party package/source paths so dependency trees are not traversed while keys are evaluated. Web-stack test jobs must clear Next.js runtime output and Wrangler/Miniflare state before tests because stale caches have caused false failures; only explicit performance caches such as `web/.next/cache` may be restored, and those keys must invalidate often. Filaments image workflows build validation-local images. Backend uses one bounded Bake invocation per job for either API plus worker-cpu or all three images, so the selected targets share one cache-busted builder solve without a remote cache. Web alone reads and writes its GHA cache. [#10864](https://github.com/jonathanong/filaments/issues/10864) owns any repository-independent remote-cache or performance design. Private infrastructure owns production ECR image publication.

Self-hosted type-aware oxlint, expensive builds, and host package installs use the named per-user
locks in [Per-User Host Locks](host-locks.md). Oxlint has the sole one-slot `memory-heavy` wrapper;
ordinary test runners are unlocked. Oxlint and most build scheduling waits are capped at 60 seconds
in GitHub Actions and then run unlocked. Host-side Next builds instead wait up to 300 seconds and
fail closed so admission timeout cannot create overlapping compilers. `next build` also caps its
page-data worker pool from the smaller positive physical or cgroup memory limit
(`experimental.cpus`) so a service limited to roughly 12 GiB gets one worker after the compile
instead of using the enclosing host's RAM and CPU count. The shared `build-web-targets` action owns
the CI-only 360-second Next command cap; the separate fail-closed acquisition wait remains 300
seconds and local builds remain uncapped. Package-manager mutation
remains a separate fail-closed correctness lock. Nested locks are rejected and each command path
has one owner.
The shared self-hosted macOS host also applies a bounded capacity-only wait before creating a job lease;
its 5 GiB floor, completion-time build-output cleanup, fail-closed cases, staged installer,
mixed-rollout contract, and idle-host deployment gate are canonical in
[Self-Hosted Runner Disk Admission And Orphan Recovery](../../.github/workflows/reference-runner-disk-admission-and-orphan-recovery.md).

CI reserves `2200–2999` in repository code through
[`ci/runner-port-policy.json`](../../ci/runner-port-policy.json): numeric runner paths receive a
deterministic 16-port slice, while nonnumeric paths dynamically allocate Fetch-safe ports outside
the range. Repository-owned Node test listeners use the validated
`listenOnRunnerUnreservedEphemeralPort()` binder, and static analysis rejects direct `listen(0)`
calls outside that policy owner. Linux runner provisioning is pending deployment of the reservation
of the same range from automatic ephemeral allocation; until then an empty
`ip_local_reserved_ports` value is expected. See
[Self-Hosted Runner Port Safety](../../.github/workflows/reference-self-hosted-runner-port-safety.md).
Allocation skips occupied candidates. Playwright jobs hold the selected sockets until each
consumer is about to bind, then release that port. Short-window callers still print-and-exit
and receive either one exact local retry or one fail-closed workflow retry for a proven late
collision. Failed
Playwright (including the credentialed suite), image-smoke (build-backend/build-web docker-image
smokes), image-lambda smoke, backend smoke, and Cloudflare Worker smoke jobs upload a one-day,
non-masking `browser-port-diagnostics-*` artifact with bounded listener, Docker publication, kernel
port-contract, and runner-context evidence; the collector does not dump the environment, reallocate
ports, or change the failing result. Every caller of `lambdas/dev-server.mts`'s `listenWithRetry`
also invokes the same collector _at bind time_ — Playwright and credentialed Playwright reach it
through the shared `webServer` config, and `static-lambdas`'s image-lambda smoke test invokes it
directly, the first non-Playwright bind-time producer — inside `listenWithRetry`'s `EADDRINUSE`
handling (first and final attempt only), because the post-hoc step runs after the process holding
the port has already been torn down (Playwright's `webServer` process group; the smoke script's own
`stop_lambda`) — by then, whatever held the port is gone. Bind-time evidence lands in
`bind-time-attempt-<n>/` subdirectories under the same artifact directory as the post-hoc evidence,
riding along on the same failure-gated upload with no separate reporting path. The image-lambda
smoke script additionally wraps that in its own `smoke-attempt-<n>/` level, one per script-side
port-reallocation retry, giving bind-time evidence the full path
`smoke-attempt-<n>/bind-time-attempt-<m>/`. If a retry recovers and the job ultimately passes,
that bind-time evidence is still written to disk but never uploaded, since the upload step never
runs without a failure — a deliberate trade-off, since a recovered collision produced no failure
to diagnose.

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

## CI behavior references

- <a id="dependabot-auto-merge-and-main-push-ci"></a>[Dependabot auto-merge and main push CI](reference-ci-standalone-workflow-checks.md#dependabot-auto-merge-and-main-push-ci)

Draft pull requests skip the expensive producer set - Playwright, credentialed Playwright, Storybook, web-integration, and PR Docker image builds - unless `playwright:full`, `vitest:full`, or `workflow_dispatch` is in effect. `ready-dedupe` reads live `draft` plus labels through the pull-request API and fail-opens to running those jobs when the lookup is missing or malformed. After a producer-running pull-request run settles, [`ci-record-state.yml`](../../.github/workflows/ci-record-state.yml) uploads a compact `ci-state-<tested-sha>` record containing the PR number, head SHA, tested merge SHA, draft-deferral flag, test-processing result, and every producer result. Every producer-running attempt records after test processing settles, including a failed processing result, so the newest attempt supersedes older green evidence. The permissionless, checkout-free recorder uses the existing `[self-hosted]` utility pool; upload failure is non-gating because the later ready run safely falls back to the full suite.

When a draft PR is marked ready for review without changing its head SHA, [`ci.yml`](../../.github/workflows/ci.yml) leaves the active draft run in place and queues the ready event behind it; `synchronize` and `converted_to_draft` still cancel obsolete pull-request work. [`ci-ready-dedupe.yml`](../../.github/workflows/ci-ready-dedupe.yml) looks up the exact SHA-scoped artifact, requires its origin to be the newest prior `CI` run for the same head SHA and PR (excluding the current ready run), and validates its version, PR number, tested merge SHA, producer-result vocabulary, successful test processing, and completed successful workflow provenance. A newer cancelled run or an attempt whose state upload is absent invalidates older evidence. A deferred record with no failed or cancelled producer sets `skip-settled-producers`, runs the expensive set, and emits one serial informational `ready-dedupe / <producer> reused` Checks row for every successful recorded producer. A non-deferred record sets `skip-ci-producers` because the same code already ran the full producer set. Failed, cancelled, expired, absent, unreadable, or malformed records and temporary-storage failures fail open to the full suite. State artifacts retain for one day, so a later ready transition also falls back safely after that retention cliff. Ready runs never write a replacement state artifact, preventing a skipped ready run from becoming false evidence for a later transition. Required `tests` and `build` gates still run so required checks remain coherent.

The checkout-free ready-dedupe job fetches [`ci/ready-dedupe.sh`](../../ci/ready-dedupe.sh) through the Contents API from `${{ job.workflow_repository }}` at `${{ job.workflow_sha }}`, rejects an empty response, then executes that temporary file. Those reusable-workflow values bind the loader to the immutable revision that defined the job instead of mutable workspace state. It has only `contents: read` in addition to its existing read permissions, and loading or execution fails closed; do not add an inline fallback or a local action/checkout to this boundary. The conditional reuse reporters are also checkout-free, permissionless, non-gating one-minute jobs; a summary-write failure cannot turn the ready transition red.

`ci.yml` does not subscribe to `pull_request:labeled`: a later label-only run would become the newest check suite for the same commit and can leave the required `tests` and `build` contexts Expected even after an earlier full CI succeeded. Set `playwright:full` or `vitest:full` when creating the PR so the initial CI attempt observes it. Adding either label later does not trigger or rerun CI; push a new commit only when another CI attempt is otherwise required.

At the start of every CI attempt, `ready-dedupe` reads the PR's current labels and draft state through the API and publishes compact `pr-labels-json`, `has-playwright-full`, `has-vitest-full`, `skip-expensive-jobs`, and `skip-settled-producers` outputs. The Vitest selector, Playwright reusable workflow input, Playwright job gate, docs-only bypass, draft expensive-job gate, and ready-for-review dedupe all consume those live values rather than the original event payload. If the API fails or returns malformed JSON, the output JSON contains both full-suite labels, both booleans are true, and expensive jobs are not skipped, so selectors fail open to full coverage.

## Coverage references

- <a id="coverage-provenance-and-transport"></a>[Coverage Provenance and Transport](reference-ci-coverage-provenance-and-transport.md)

The shared cleanup action reclaims common stale generated trees, every preserved `node_modules` directory, `$RUNNER_TEMP/wrangler-logs`, and `$RUNNER_TEMP/voucha-wrangler` with non-interactive `sudo` when available, then restores owner write bits on directories only before cleaning. If `git clean` still finds another locked-down generated path, it repairs the workspace while pruning `.git` and retries once. That recovery prevents prior generated non-writable files from blocking cleanup or forced pnpm relinks on persistent self-hosted runners without making pnpm store hardlinks writable.

Every persistent-workspace cleaner caller checks out with `clean: false`, extracts only the five trusted cleaner prerequisites from the checked-out `HEAD` tree with `git archive`, and then invokes `.github/actions/clean-workspace`. The bootstrap neither deletes nor rebuilds Git’s index, so metadata-only jobs do not rematerialize every tracked file before cleanup. The packaged cleaner clears repository-local sparse-checkout state, resets tracked changes, and verifies the index; it reconstructs the complete index only when reset fails twice or the health check detects corruption or remaining skip-worktree entries, and logs the restored path count and elapsed time when that recovery runs. Permission repair batches `chown` and `chmod` operands and remains targeted to generated trees unless a demonstrated reset or clean failure requires a whole-workspace fallback.

`storybook-static` is keep-classified for its one-day retention because the trusted Cloudflare Pages publisher consumes it only after the source workflow completes.

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
- <a id="playwright-ci-selection"></a>[Playwright CI Selection](reference-ci-playwright-ci-selection.md)
- <a id="vitest-ci-selection"></a>[Vitest CI Selection](reference-ci-vitest-ci-selection.md)
- <a id="workspace-cross-reference"></a>[Workspace Cross-Reference](reference-ci-workspace-cross-reference.md)
- <a id="adding-a-trustedcredentialed-ci-job"></a>[Adding a Trusted/Credentialed CI Job](reference-ci-adding-a-trusted-credentialed-ci-job.md)
- <a id="ci-job-timeout-budgets"></a>[CI Job Timeout Budgets](reference-ci-ci-job-timeout-budgets.md)
