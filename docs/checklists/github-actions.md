# GitHub Actions Checklist

Use this checklist when adding, removing, or modifying a workflow (`.github/workflows/*.yml`) or composite action.

## Checklist

- **Runner preference** — use only the closed GitHub-hosted label set enforced by `runner-policy.test.mts`: `ubuntu-slim` (default — `gh api`/prompt-rendering/aggregator jobs with no Docker, no `services:`, and no `setup-node-pnpm`/`setup-backend`), `ubuntu-latest` (Docker, `services:`, Playwright/browsers, or Node/pnpm/backend setup), `ubuntu-24.04-arm` (native ARM64 image builds only — `build-web.yml`/`build-backend.yml`), or `macos-latest` (gated by `vars.CI_PORTABILITY_MACOS_ENABLED`, `tests-portability.yml` only).
- **Runner label changes** — update `RUNNERS.md § Runner Types`, the relevant grouped inventory reference's Runner column, and `runner-policy.test.mts`'s closed allowlist. Note: the canonical `Workflow automation map` Mermaid does **not** encode runner labels.
- **Runner-demand budget** — state which pool a new or changed job draws from (`Tests`, `CPU`, `Playwright`, Ubicloud, CodeBuild, or a fenced-off pool such as `dependabot`) and apply the [live-capacity procedure](../../.github/workflows/reference-runner-fleet-capacity.md) before increasing self-hosted demand. It requires timestamped runner, queue, disk, and projected-fan-out evidence; missing or truncated evidence permits only demand-neutral or demand-reducing recommendations. The `dependabot` runners are permanently fenced off and never available for test-pool reassignment.
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
- **No npm package caches** — never cache `node_modules`, pnpm/npm/yarn stores, or enable `actions/setup-node` package-manager cache helpers.
- **No sparse checkout** — never pass `sparse-checkout` or `sparse-checkout-cone-mode` to `actions/checkout`, or run a command that enables sparse checkout, in a workflow job or composite action step. Self-hosted runners reuse one persistent `_work` checkout directory across unrelated job runs; sparse-checkout config a job sets is not automatically unset, so it silently narrows the tree the next, unrelated job checks out of the same directory. Check out the full tree instead; disable/unset cleanup commands are allowed. Enforced by the package-owned `no-mistakes/no-sparse-checkout` rule.
- **Writable Docker workspace mounts** — a Docker container that bind-mounts `$GITHUB_WORKSPACE` read-write must pass the host UID/GID with `--user "$(id -u):$(id -g)"`; read-only workspace mounts are exempt. Enforced by the YAML-aware repo-file-policy Docker workspace user guard.
- **pnpm install lifecycle** — every `setup-node-pnpm`/`setup-backend` caller declares its runner lifecycle. Persistent runners use the full unfiltered warm install; only the three typed ephemeral profiles may declare selector-only closures. Do not add a second direct `pnpm install` after either action.
- **Docker host ports** — normally let Docker allocate the host-side port (use `-p "127.0.0.1::<container_port>"`); never hardcode a literal host port. A workflow may instead bind a port allocated from [`ci/runner-port-policy.json`](../../ci/runner-port-policy.json) when it must coordinate Docker with sibling processes in the same deterministic runner slice. Long-window jobs (Playwright) use `ci/allocate-browser-safe-ports.py --hold` and `--release` (returns only once the port is bindable on `127.0.0.1`) immediately before `docker run` or `listen`. Short-window callers may still print-and-exit and pair that handoff with one exact, bounded collision retry.
- **Script portability** — inline workflow scripts and composite-action scripts must support both macOS and Linux runners. Avoid Bash features unavailable in macOS `/bin/bash` 3.2 unless the step explicitly installs and invokes a newer shell.
- **Binary downloads** — when downloading binary archives, include the tool version or resolved revision in the downloaded filename/directory so updates cannot reuse stale generic `/tmp` paths.
- **Security-guard migrations** — before replacing or deleting a workflow/security guard, enumerate the old threat cases, port the old fixture corpus to the replacement, and make the replacement pass those fixtures before removing the old guard. Bind policy decisions to immutable SHAs, and verify which inputs are runner-owned versus repo-owned so an untrusted PR cannot rewrite the policy being enforced.

## See Also

- [github-actions-checklist skill](../../.agents/skills/github-actions-checklist/SKILL.md) — skill entry point
- [.github/workflows/CLAUDE.md](../../.github/workflows/CLAUDE.md) — scoped workflow invariants and canonical-doc routing
- [.github/workflows/AUTHORING.md](../../.github/workflows/AUTHORING.md) — step timeouts, sharding, PR splitting
- [.github/workflows/RUNNERS.md](../../.github/workflows/RUNNERS.md) — runner types and host safety
- [docs/development/dependency-updates.md#pinning-style-for-github-actions](../development/dependency-updates.md#pinning-style-for-github-actions) — pinning style
