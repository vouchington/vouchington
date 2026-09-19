# Runner Types

[Back to Workflow Runners](RUNNERS.md#runner-types)

**Canonical runner-label selection rule.** Pick a label set by what the job actually requires, not
by treating labels as host-carving selectors: **arch/OS-independent, no Docker, no test services →
`[self-hosted]`** (the default — a cross-OS superset match, so such a job may land on macOS as
accepted overflow; pin `Linux` only when a step genuinely requires it); **needs Docker/services,
or is a Linux Vitest job → add `Docker`, `Tests`** (`[self-hosted, Linux, Docker, Tests]`); **needs
Linux+ARM64 (a native arm64 artifact) → `ubuntu-24.04-arm`** (no self-hosted Linux host is
ARM64 — self-hosted macOS cannot produce a Linux artifact). Verify inventory and headroom live with
the [Runner Fleet Capacity live-capacity procedure](reference-runner-fleet-capacity.md). The terse
version of this rule lives in [CLAUDE.md](CLAUDE.md); this is the canonical, detailed version.

GitHub-hosted runners:

- The closed GitHub-hosted label allowlist is `ubuntu-slim`, `ubuntu-latest`, `ubuntu-24.04-arm`, and
  `macos-latest`, enforced by `ALLOWED_LABELS` in
  [`runner-policy-classify.mts`](runner-policy-classify.mts); see the [canonical
  checklist](../../docs/checklists/github-actions.md#checklist)'s "Runner preference" entry for when
  each applies, and the ephemeral GitHub-hosted list below for the ARM64 build/dedupe jobs.

Self-hosted:

- `self-hosted` — the default label for any job that is arch/OS-independent, needs no Docker, and needs no test services. This is not a utility-only label — it is a **cross-OS superset** match, so such a job may opportunistically land on macOS as accepted overflow; pin `Linux` only when a step genuinely requires it. Verify live inventory and headroom through the [Runner Fleet Capacity live-capacity procedure](reference-runner-fleet-capacity.md). Used by utility and aggregator jobs (e.g. `detect-changes`, `tests` rollup, `static-code-analysis`, `sync-articles`, CI orchestration), and by three of the four `checks-static.yml` static-gate jobs (`static-backend`, `static-lambdas`, `static-cloudflare`; typecheck, dependency-cruiser, API fixture snapshot regeneration, and cloudflare/lambda smoke — none of which touch Docker or a database/cache service). Also used by every Auto Harness automation orchestration job (gate/render-prompt/dedup/escalate in `fix-main.yml`, `fix-issue.yml`, `plan.yml`, `shepherd.yml`, `scheduled-prompts.yml`; dispatch in `harness-dispatch.yml`; check-duplicates in `fix-dependabot.yml`) — pure `gh`/`node` orchestration with no Docker or test-service dependency. No purpose label needed.
- `self-hosted, Linux` — pinned Linux subset of the bare `[self-hosted]` pool, for a job that is otherwise utility-shaped (no Docker, no test services) but must not land on macOS overflow. Used by `checks-static.yml`'s `static-web` job: it builds and publishes through the `.github/actions/build-web-targets` composite (issue #10990), sharing that composite's `.next/standalone` artifact-shape contract with the Linux-only Playwright and web-integration consumers — a macOS build's platform-specific native deps (e.g. `sharp`) would be unusable by them.
- `self-hosted, Linux, Docker` — Docker hosts for control-plane and backend-stack jobs that need Docker but do not run tests, including `explain-analyze.yml` and `initialize-smoke-test.yml`.
- `self-hosted, Tests` — cross-OS (Linux + macOS) pool. Prefer an explicit OS subset when host behavior or deterministic suite ownership matters.
- `self-hosted, macOS, Tests` — macOS-specific subset of the Tests pool; used for Swift/.NET clients and the focused portability canaries.
- `self-hosted, Linux, Docker, Tests` — Linux Docker hosts for service-backed tests and Linux-owned broad Vitest suites, including the standalone `checks-backend-smoke.yml` API/worker smoke job. Also runs `tests-web.yml`'s sharded `web-tests` job and the unsharded `tests-backend-modules.yml` job, both relocated here from billed Ubicloud (`ubicloud-standard-8-arm` / `ubicloud-standard-4-arm`). Any future capacity/headroom claim for that pool must use the live [Runner Fleet Capacity procedure](reference-runner-fleet-capacity.md), not this reference. Both jobs dropped their `actions/cache` round-trip for `.cache/vite`/`.cache/vitest`: `./.github/actions/clean-workspace` already excludes `.cache/` from `git clean` on self-hosted hosts, so the cache persists across runs on the same host for free — the upload/download steps were dead overhead once the job stopped running on ephemeral Ubicloud, matching the pattern already in place for `tests-backend-unit.yml`.
- `self-hosted, Docker, CPU` — Docker hosts for compute-heavy build jobs (e.g. native module builds inside test workflows).
- `self-hosted, Linux, Docker, Tests, CPU` — append `CPU` to an existing pool's label set when a test job also runs a memory-intensive build (e.g. `next build`) and needs `services:` containers. The `CPU` label routes the job to a higher-memory host within that pool; it does not change the pool itself. Used by `tests-web-integration.yml` (`web-integration-tests`).
- `self-hosted, Playwright` — pool for self-hosted Playwright support jobs (e.g. Storybook). The Playwright `select` job is bare `[self-hosted]` so planning does not occupy this pool.
- `self-hosted, Linux, Docker, Playwright` — pool for Playwright E2E and credentialed test shards.
  Hosts persist `~/.cache/ms-playwright` (browsers) and `web/.next/cache` (Next.js build cache via
  `clean-workspace` `extra-keep`) across runs — no `actions/cache` upload/download needed.

GitHub-hosted (ephemeral):

- `ubuntu-latest` — for non-ARM jobs that must stay ephemeral, including `pnpm-dedupe.yml` and validated dependency-lock publishers.
- `ubuntu-24.04-arm` — the default runner for `build-web.yml`'s and `build-backend.yml`'s `build` jobs in every context, including `main`; there is no smaller/larger size tier to pick between, unlike the former Ubicloud `ubicloud-standard-4-arm`/`ubicloud-standard-8-arm` split (Ubicloud was cancelled 2026-09-19). On PRs, `build-web.yml`'s build job assumes `AWS_TEST_ROLE_ARN` for test/smoke credentials but does not publish to AWS, and reads and writes build cache through GitHub Actions. `build-backend.yml`'s active profile builds `api` + `worker-cpu`; setting `WORKER_IO_AUTOMATION_ENABLED=true` in [the shared flag](../worker-io-automation.env) selects all three images in the same Bake invocation — the earlier three-image bake OOM-crashed the smaller Ubicloud tier even with sequential exports, so the optional three-image solve must remain reliable. Neither `build-web.yml` nor `build-backend.yml` runs `tests-web.yml`'s sharded `web-tests` job or `tests-backend-modules.yml`'s job — those moved to `[self-hosted, Linux, Docker, Tests]` (see above).
