# Runner Types

[Back to Workflow Runners](RUNNERS.md#runner-types)

**Canonical runner-label selection rule.** Pick a label set by what the job actually requires, not
by treating labels as host-carving selectors: **arch/OS-independent, no Docker, no test services →
`[self-hosted]`** (the default — a cross-OS superset match, so such a job may land on macOS as
accepted overflow; pin `Linux` only when a step genuinely requires it); **needs Docker/services,
or is a Linux Vitest job → add `Docker`, `Tests`** (`[self-hosted, Linux, Docker, Tests]`); **needs
Linux+ARM64 (a native arm64 artifact) → `ubicloud-standard-*-arm`** (no self-hosted Linux host is
ARM64 — self-hosted macOS cannot produce a Linux artifact). Verify inventory and headroom live with
the [Runner Fleet Capacity live-capacity procedure](reference-runner-fleet-capacity.md). The terse
version of this rule lives in [CLAUDE.md](CLAUDE.md); this is the canonical, detailed version.

GitHub-hosted runners:

- Do not use GitHub-hosted labels such as `ubuntu-*`, `windows-*`, or `macos-*`. Jobs should run on repo self-hosted runners or Ubicloud only.

Self-hosted:

- `self-hosted` — the default label for any job that is arch/OS-independent, needs no Docker, and needs no test services. This is not a utility-only label — it is a **cross-OS superset** match, so such a job may opportunistically land on macOS as accepted overflow; pin `Linux` only when a step genuinely requires it. Verify live inventory and headroom through the [Runner Fleet Capacity live-capacity procedure](reference-runner-fleet-capacity.md). Used by utility and aggregator jobs (e.g. `detect-changes`, `tests` rollup, `static-code-analysis`, `sync-articles`, CI orchestration), and by three of the four `checks-static.yml` static-gate jobs (`static-backend`, `static-lambdas`, `static-cloudflare`; typecheck, dependency-cruiser, API fixture snapshot regeneration, and cloudflare/lambda smoke — none of which touch Docker or a database/cache service). Also used by every Auto Harness automation orchestration job (gate/render-prompt/dedup/escalate in `fix-main.yml`, `fix-issue.yml`, `plan.yml`, `shepherd.yml`, `scheduled-prompts.yml`; dispatch in `harness-dispatch.yml`; check-duplicates in `fix-dependabot.yml`) — pure `gh`/`node` orchestration with no Docker or test-service dependency. No purpose label needed.
- `self-hosted, Linux` — pinned Linux subset of the bare `[self-hosted]` pool, for a job that is otherwise utility-shaped (no Docker, no test services) but must not land on macOS overflow. Used by `checks-static.yml`'s `static-web` job: it builds and publishes through the `.github/actions/build-web-targets` composite (issue #10990), sharing that composite's `.next/standalone` artifact-shape contract with the Linux-only Playwright and web-integration consumers — a macOS build's platform-specific native deps (e.g. `sharp`) would be unusable by them.
- `self-hosted, Linux, Docker` — Docker hosts for control-plane and backend-stack jobs that need Docker but do not run tests, including `explain-analyze.yml` and `initialize-smoke-test.yml`.
- `self-hosted, Tests` — cross-OS (Linux + macOS) pool. Prefer an explicit OS subset when host behavior or deterministic suite ownership matters.
- `self-hosted, macOS, Tests` — macOS-specific subset of the Tests pool; used for Swift/.NET clients and the focused portability canaries.
- `self-hosted, Linux, Docker, Tests` — Linux Docker hosts for service-backed tests and Linux-owned broad Vitest suites, including the standalone `checks-backend-smoke.yml` API/worker smoke job. Also runs `tests-web.yml`'s sharded `web-tests` job and the unsharded `tests-backend-modules.yml` job, both relocated here from billed Ubicloud (`ubicloud-standard-8-arm` / `ubicloud-standard-4-arm`). Any future capacity/headroom claim for that pool must use the live [Runner Fleet Capacity procedure](reference-runner-fleet-capacity.md), not this reference. Both jobs dropped their `actions/cache` round-trip for `.cache/vite`/`.cache/vitest`: `./.github/actions/clean-workspace` already excludes `.cache/` from `git clean` on self-hosted hosts, so the cache persists across runs on the same host for free — the upload/download steps were dead overhead once the job stopped running on ephemeral Ubicloud, matching the pattern already in place for `tests-backend-unit.yml`.
- `self-hosted, Docker, CPU` — Docker hosts for compute-heavy build jobs (e.g. native module builds inside test workflows).
- `self-hosted, Linux, Docker, Tests, CPU` — append `CPU` to an existing pool's label set when a test job also runs a memory-intensive build (e.g. `next build`) and needs `services:` containers. The `CPU` label routes the job to a higher-memory host within that pool; it does not change the pool itself. Used by `tests-web-integration.yml` (`web-integration-tests`).
- `self-hosted, Linux, X64, Docker, Code Review` — dedicated pool of 4 repo runners for the advisory `opencode-zen-code-review.yml`, `opencode-openrouter-code-review.yml`, and `claude-openrouter-code-reviewer.yml` reusable-workflow calls (1 job each) — 3 concurrent LLM reviews fan out per PR commit, isolated from the shared Tests/Docker pools so a slow or backlogged AI review job can never delay a required CI check. A single-PR canary on #11105 (2026-09-06) exercised this 3x fan-out with no queueing observed. `opencode-zen-code-review.yml` and `opencode-openrouter-code-review.yml` were split from a single combined workflow in #11267 after a hang in the Zen job starved the OpenRouter job's admission for hours at a time — each is now its own workflow run, so a stall in one can no longer hold the other's runs pending. Each of the 3 reviewer jobs still carries its own repo-wide fleet-admission concurrency group (1 concurrent execution per reviewer type, FIFO-queued), so total demand from this pool is capped at 3 regardless of how many PRs are open concurrently. Re-verify via the [Runner Fleet Capacity live-capacity procedure](reference-runner-fleet-capacity.md) before adding a fourth reviewer.
- `self-hosted, Playwright` — pool for self-hosted Playwright support jobs (e.g. Storybook). The Playwright `select` job is bare `[self-hosted]` so planning does not occupy this pool.
- `self-hosted, Linux, Docker, Playwright` — pool for Playwright E2E and credentialed test shards.
  Hosts persist `~/.cache/ms-playwright` (browsers) and `web/.next/cache` (Next.js build cache via
  `clean-workspace` `extra-keep`) across runs — no `actions/cache` upload/download needed.

Ubicloud (ephemeral):

- `ubicloud-standard-2` — for non-ARM jobs that must stay ephemeral, including `pnpm-dedupe.yml` and validated dependency-lock publishers. This is a closed set enforced by `ephemeral-runner-policy.test.mts`.
- `ubicloud-standard-4-arm` — the default runner for `build-web.yml`'s `build` job in every context, including `main` (see the CodeBuild escape-hatch rationale below); on PRs that build job assumes `AWS_TEST_ROLE_ARN` for test/smoke credentials but does not publish to AWS, and reads and writes build cache through GitHub Actions. No longer runs `tests-backend-modules.yml` — that job moved to `[self-hosted, Linux, Docker, Tests]` (see above).
- `ubicloud-standard-8-arm` — default runner for `build-backend.yml`'s `build` job in every context, for the same reason. The active profile builds `api` + `worker-cpu`; setting `WORKER_IO_AUTOMATION_ENABLED=true` in [the shared flag](../worker-io-automation.env) selects all three images in the same Bake invocation. Keep the 8-arm runner until the two-image default has measured memory evidence for downsizing: the earlier three-image bake OOM-crashed 4-arm even with sequential exports, and the optional three-image solve must remain reliable. No longer runs `tests-web.yml`'s sharded `web-tests` job — that job moved to `[self-hosted, Linux, Docker, Tests]` (see above), reversing the #7513 offload onto elastic capacity now that Vitest selection narrows the common case.

AWS CodeBuild-hosted (ephemeral, issue #6681):

- Filaments image-validation jobs can opt into ephemeral GitHub Actions runners hosted by the
  private infrastructure repository's managed CodeBuild runner.
- Label syntax (GitHub's documented folded form for CodeBuild-hosted runners —
  a single space-separated string):
  `<managed-build-runner> image:<image-id> instance-size:<size>`.
  One managed runner service serves every job shape via this override; there is
  no per-shape project.
- Image/size combinations used by consuming workflows:
  - `image:arm-3.0 instance-size:large` — 8 vCPU / 16 GiB, ARM. The CodeBuild
    escape hatch for `build-web.yml` `build` — reachable only through the
    var/label opt-in below, never the default; see § build-image-runner
    decision below.
  - `image:arm-3.0 instance-size:xlarge` — 32 vCPU / 64 GiB, ARM. The
    CodeBuild escape hatch for `build-backend.yml` `build` — same opt-in-only
    reachability; see § build-image-runner decision below.
- Ubicloud-default, CodeBuild-escape-hatch runners: `build-backend.yml` and
  `build-web.yml` default to Ubicloud (`ubicloud-standard-8-arm` /
  `ubicloud-standard-4-arm`) for validation. On PRs that don't
  touch Docker infra, both jobs still only run when `build-*-infra` path
  filters detect Docker-infra changes; those runs load images locally for
  validation and assume `AWS_TEST_ROLE_ARN` for test/smoke credentials. Backend
  reuses only the shared job-local BuildKit solver state; web reads and writes
  GitHub Actions cache. Neither publishes a runtime image to ECR regardless of
  which runner it lands on.
  CodeBuild is reachable only as an opt-in escape hatch, for any ref: the
  `runs-on` condition is `vars.CI_IMAGE_BUILDS_ON_CODEBUILD == 'true'` (a
  global validation-window switch, default unset) OR
  `contains(github.event.pull_request.labels.*.name, 'codebuild:images')` (a
  per-PR opt-in label) — falling back to Ubicloud when neither is set,
  including on `main`. The label is the recommended way to validate a size
  change before merge, because it scopes the added CodeBuild cost to one PR;
  the var bumps every open PR's image builds — and `main`, if a push lands
  while it's set — onto CodeBuild simultaneously, and should only be set for a
  short, deliberate window (see the runner-demand-budget note in § Runner
  Fleet Capacity). The escape-hatch sizes (`arm-3.0`/`xlarge` for backend,
  `arm-3.0`/`large` for web) are the values proven safe before this workflow
  ever right-sized anything, not a new experiment — see § build-image-runner
  decision below for why.
  **Adding the label alone does not start a run** — `ci.yml`'s `pull_request`
  trigger deliberately omits `labeled`/`unlabeled` (matching the existing
  `playwright:full` label), so a `labeled` event creates no new check run, and
  re-running an existing run replays its original event payload rather than
  re-reading labels. Add the label, then push a commit (a `synchronize` event
  reads the label at trigger time) to actually exercise the CodeBuild path.

### build-image-runner decision

The historical three-image Docker bake (`api` + `worker-cpu` + `worker-io`) needed somewhere
in the memory range (12 GB, 24 GB]: it OOM-crashed BuildKit on
`ubicloud-standard-4-arm` (12 GB) even at `max-parallelism = 1` (see
`ubicloud-standard-8-arm` above), and runs successfully today at
`max-parallelism = 3` on `ubicloud-standard-8-arm` (24 GB). The merged deployment
profile now builds `api` + `worker-cpu` by default, while the checked-in
shared `WORKER_IO_AUTOMATION_ENABLED` flag restores the third image build when set to `true`. Until the two-image path has
new peak-memory measurements, runner sizing continues to cover that reversible path.
CodeBuild ARM has
no tier between `large` (16 GiB) and `xlarge` (64 GiB) — `large` sits in the
uncertain middle of that envelope, so an earlier iteration of this decision
tried `large` + a reduced `max-parallelism` as the CodeBuild default and
validated it on a PR before reverting.

**Current decision: Ubicloud is the default for both jobs in every context,
and CodeBuild is an escape hatch only** (see the runner bullet above) — not a
sized-down default. An escape hatch exists for the moment the operator
toolbox needs it most, typically an AWS-backbone incident or an Ubicloud
outage; it must not itself be an unproven experiment at that moment. So the
escape-hatch sizes revert to the values proven safe for years before this PR
ever touched them: `xlarge` (64 GiB) for `build-backend.yml`, `large` (16 GiB)
for `build-web.yml`. `build-backend.yml`'s shared BuildKit `max-parallelism`
is restored to `3` accordingly — both the Ubicloud default (24 GiB) and the
CodeBuild escape hatch (64 GiB) comfortably support full parallelism, so there
is no longer a reason to run any branch at a reduced value.

Rollback from a misbehaving Ubicloud image-build path is the
`vars.CI_IMAGE_BUILDS_ON_CODEBUILD` toggle itself (or the `codebuild:images`
label for a single PR) — no code change, no size tuning. Rollback from a
misbehaving CodeBuild escape hatch would require reintroducing a smaller
CodeBuild tier, which is out of scope unless the escape hatch actually needs
exercising; until then it stays pinned to the proven `xlarge`/`large` sizes.
The `main`-branch concurrency protection in § AWS CodeBuild Service Quotas And
Concurrency still applies when the escape hatch is active, since that
protection is about serializing overlapping `main` pushes for this job and
does not depend on which runner (Ubicloud or CodeBuild, or which ARM tier)
runs it.
