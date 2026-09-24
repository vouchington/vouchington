# GitHub Actions Checklist

Use this checklist when adding, removing, or modifying a workflow (`.github/workflows/*.yml`) or composite action.

## Checklist

- **Runner preference** — use only the closed GitHub-hosted label set enforced by `runner-policy.test.mts`: `ubuntu-slim` (default — `gh api`/prompt-rendering/aggregator jobs with no Docker, no `services:`, and no `setup-node-pnpm`/`setup-backend`), `ubuntu-latest` (Docker, `services:`, Playwright/browsers, or Node/pnpm/backend setup), `ubuntu-24.04-arm` (native ARM64 image builds only — `build-web.yml`/`build-backend.yml`), or `macos-latest` (gated by `vars.CI_PORTABILITY_MACOS_ENABLED`, `tests-portability.yml` only).
- **Runner label changes** — update the relevant grouped inventory reference's Runner column (see [Job & runner inventory](../../.github/workflows/JOBS.md)) and `runner-policy.test.mts`'s closed allowlist. Note: the canonical `Workflow automation map` Mermaid does **not** encode runner labels.
- **Runner-demand budget** — state which hosted label a new or changed job draws from and prefer the smallest runner that fits the workload. Keep new fan-out bounded and justify any increase in parallel jobs.
- **Pin remote Actions** to a 40-hex commit SHA with a `# vX` version comment, including first-party `actions/*` and `github/*`. Local `./` composite paths stay unpinned. Owner: no-mistakes `github-actions-pinned-hash`. See [dependency-updates.md § Pinning style](../development/dependency-updates.md#pinning-style-for-github-actions).
- **Local composite actions require a checkout** — `uses: ./.github/actions/<name>` only resolves once `$GITHUB_WORKSPACE` has been populated by an `actions/checkout` step; a job with no checkout cannot call one. Jobs that preserve a persistent workspace use the bounded `actions/checkout` → workspace-cleaner restore → `clean-workspace` sequence. Do not add that sequence to a job deliberately kept checkout-free (for example, a one-minute gate) merely to deduplicate inline script; weigh the real runner-demand and registry-reachability cost first. Do not add an unconditional whole-workspace `find`/`chown`/`chmod` traversal before checkout. Repair the producer or runner isolation, or use a targeted post-failure repair when logs demonstrate the need.
- **Concurrency** — every workflow must declare a concurrency group. PR workflows normally cancel in-progress; per-unit main workflows use `cancel-in-progress: false`. `ci.yml` deliberately disables `cancel-in-progress` for the `ready_for_review` event too, so marking a draft ready queues a fully independent full rerun behind the in-progress draft run instead of cancelling it; there is no cross-run result reuse. Keep the exception action-specific and assert that code-changing PR events still cancel.
- **Deploys stay decoupled** — no cross-workflow deploy-order wait/poll; each deployable is forward/backward-compatible with whatever is live (expand/contract). Only api↔workers may couple (shared DB/code/image). See [deploy decoupling](../overview/infrastructure/deployment.md#deploy-decoupling--independent-safety).
- **`actionlint`** — run on all changed `.github/workflows/*.yml` files before pushing. CI enforces it.
- **`actionlint` `queue` false positive** — actionlint 1.7.12 does not recognize GitHub's
  `concurrency.queue` field (used as `queue: max` to make a workflow a real FIFO queue, e.g.
  the Auto Harness fleet-wide dispatch admission group). It flags `queue: max` as an unexpected
  key. Do not remove an intentional FIFO queue to silence this. CI's `actionlint` step in
  [`actionlint.yml`](../../.github/workflows/actionlint.yml) already ignores it repo-wide via
  `-ignore 'unexpected key "queue" for "concurrency" section'`; run actionlint locally with the same
  flag rather than treating a local `queue` finding as a real lint error.
- **Auto Harness fleet-wide dispatch admission** — every Harness-dispatching job across all 7
  harness workflows shares one fixed `concurrency.group` literal, `harness-dispatch-fleet-admission`,
  bounding concurrent dispatch fleet-wide to 1 with `queue: max` FIFO queuing and
  `cancel-in-progress: false` (nothing is ever cancelled or skipped). This replaced a prior
  4-lane `admission-bucket` hedge (`lane = GITHUB_RUN_ID % ADMISSION_LANES`) that had no fleet
  telemetry behind its lane count. Because the group is now a single literal rather than
  per-workflow lane math, extracting that math into a shared composite action (issues #10414,
  #10585) is moot — there is no math left to share.
- **Workflow policy tests** — run
  `pnpm exec vitest run --project github-actions` for every workflow or composite action change.
- **Keep docs in sync** — update the relevant grouped inventory reference and the canonical
  [Workflow automation map](../../.github/workflows/reference-workflow-automation-map.md) when
  adding or removing workflows. Update [README.md](../../.github/workflows/README.md) and
  [WORKFLOWS.md](../../.github/workflows/WORKFLOWS.md) navigation only when adding or removing a
  focused reference leaf or group.
- **Cache the pnpm store, Playwright browsers, and shared CI web runtime output only** — every job runs on a fresh, ephemeral runner. `setup-node-pnpm`/`setup-backend` cache the resolved `pnpm store path --silent` directory and `setup-playwright` caches `~/.cache/ms-playwright`, both via a SHA-pinned `actions/cache` step keyed on `runner.os`, `runner.arch`, and a shell-computed SHA-256 of `pnpm-lock.yaml` exposed through a step output. The Playwright cache omits `restore-keys` so a stale browser build fails loudly at install time instead of silently restoring. `build-web-targets` alone may cache its standalone Next.js server, copied static assets, and Cloudflare Worker bundle under an exact run/attempt/source/platform key; consumers validate the restore and build locally on a miss or incomplete result. Never cache `node_modules` directly or enable `actions/setup-node`'s built-in package-manager `cache:` input. Enforced by `cache-path-policy.test.mts`.
- **Sparse checkout is allowed** — every job runs on a fresh, ephemeral runner with its own disposable `_work` directory, so the old self-hosted concern (a persistent checkout directory reused across unrelated job runs, silently inheriting a prior job's narrowed sparse-checkout config) no longer applies. `actions/checkout`'s `sparse-checkout`/`sparse-checkout-cone-mode` inputs may be used where they help; there is no repo-wide ban and no `no-mistakes` rule enforcing one.
- **Writable Docker workspace mounts** — a Docker container that bind-mounts `$GITHUB_WORKSPACE` read-write must pass the host UID/GID with `--user "$(id -u):$(id -g)"`; read-only workspace mounts are exempt. Enforced by the YAML-aware repo-file-policy Docker workspace user guard.
- **pnpm install lifecycle** — every job runs on a fresh, ephemeral runner, so `setup-node-pnpm`/`setup-backend` always perform one full `pnpm install --frozen-lockfile` against a restored pnpm store cache (see the caching bullet above); there is no reconciliation or warm-state fingerprinting to configure. Set `install-scripts: 'false'` only for control-plane jobs per `pnpm-install-policy.test.mts`'s allowlist. Do not add a second direct `pnpm install` after either action.
- **Docker host ports** — normally let Docker allocate the host-side port (use `-p "127.0.0.1::<container_port>"`); never hardcode a literal host port. A workflow that needs coordination inside one job may use `ci/allocate-browser-safe-ports.py`. Long-window jobs use `--hold` and `--release` immediately before `docker run` or `listen`; short-window callers may print-and-exit and pair that handoff with one exact, bounded collision retry.
- **Script portability** — inline workflow scripts and composite-action scripts must support both macOS and Linux runners. Avoid Bash features unavailable in macOS `/bin/bash` 3.2 unless the step explicitly installs and invokes a newer shell.
- **Binary downloads** — when downloading binary archives, include the tool version or resolved revision in the downloaded filename/directory so updates cannot reuse stale generic `/tmp` paths.
- **Security-guard migrations** — before replacing or deleting a workflow/security guard, enumerate the old threat cases, port the old fixture corpus to the replacement, and make the replacement pass those fixtures before removing the old guard. Bind policy decisions to immutable SHAs, and verify which inputs are runner-owned versus repo-owned so an untrusted PR cannot rewrite the policy being enforced.

## See Also

- [github-actions-checklist skill](../../.agents/skills/github-actions-checklist/SKILL.md) — skill entry point
- [.github/workflows/CLAUDE.md](../../.github/workflows/CLAUDE.md) — scoped workflow invariants and canonical-doc routing
- [.github/workflows/AUTHORING.md](../../.github/workflows/AUTHORING.md) — step timeouts, sharding, PR splitting
- [docs/development/dependency-updates.md#pinning-style-for-github-actions](../development/dependency-updates.md#pinning-style-for-github-actions) — pinning style
