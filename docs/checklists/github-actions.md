# GitHub Actions Checklist

Use this checklist when adding, removing, or modifying a workflow (`.github/workflows/*.yml`) or composite action.

## Checklist

Enforced rules name their check; the check owns the detail. Judgment calls stay here.

### Enforced

- **Runner labels** — a closed label set keeps hosted-runner demand and architecture deliberate. `.github/runner-policy.json` is checked by the released `vouchington runner-policy` command in static CI; `ci/check-build-web-targets-contract-policy.mts` separately protects shared web build architecture.
- **Pinned actions** — a commit SHA stops a re-pointed tag from silently changing what runs. no-mistakes `github-actions-pinned-hash`.
- **Script expressions** — free-form event text interpolated into a script is code injection, so it travels through `env:`. The enabled no-mistakes `github-actions-script-expressions` rule owns this check.
- **Checkout credentials** — a write-capable token must not stay in `.git` for later steps. The enabled no-mistakes `github-actions-checkout-credentials` rule owns this check.
- **Called-workflow secrets** — a caller passes only secrets the callee declares, never `secrets: inherit`. `ci/check-workflow-safety-policy.mts` in required static CI; finite secret-passing cases stay in `secret-context.permissions.part-2.test.mts`.
- **Docker host ports** — fixed host ports collide on shared hosts. The enabled no-mistakes `github-actions-docker-host-ports` rule owns this check.
- **Docker workspace user** — a root-owned write into a bind-mounted workspace breaks later cleanup. The Docker workspace user check in `vouchington-tooling/gha-workspace-policy`, run by `static-code-analysis/repo-file-policy`.
- **Downloads** — unverified binaries are a supply-chain hole. `ci/check-workflow-download-integrity.mts` checks tracked workflow YAML, workflow shell scripts, composite action manifests, and sibling action shell scripts in the required static analysis job; its fixture test is `ci/workflow-download-integrity.test.mts`. The enabled no-mistakes `github-actions-download-integrity` rule also checks workflow YAML. Also put the tool version in the downloaded filename or directory so a generic `/tmp` path cannot serve a stale binary (unenforced).
- **Workflow operations inventories** — dispatch subscriptions, Postgres workflow image/service settings, PR revision pairs, and workflow shell-script ownership are checked over tracked workflow files by `ci/check-workflow-ops-policy.mts`, invoked from the required static scan `ci/check-repository-policy-scans.mts`; fixture cases live in `ci/check-workflow-ops-policy.test.mts`.
- **Caching** — ephemeral runners make `node_modules` and ad-hoc caches a stale-state risk. `ci/check-workflow-cache-pnpm-policy.mts` runs in static CI.
- **pnpm install** — one install per job, from the shared setup actions, keeps installs fast and script-free where required. `ci/check-workflow-cache-pnpm-policy.mts` runs in static CI.
- **Concurrency** — an unlocked workflow duplicates runs and a wrong cancel policy drops merge-queue or main work. The `workflow-topology-policy` rule in [`.no-mistakes/rules/policies.yml`](../../.no-mistakes/rules/policies.yml) (reasoned exceptions, cancel intent, group collisions) and the literal area prefix in `area-workflows.test.mts`.
- **CI dependency images** — anonymous Docker Hub and public mirror pulls hit shared quotas and ejected unrelated merge-queue entries ([#2653](https://github.com/vouchington/vouchington/issues/2653), [#3507](https://github.com/vouchington/vouchington/issues/3507)). Use reviewed digest-pinned GHCR dependency packages; the released Docker image mirror check guards workflow and Dockerfile image positions. See [bootstrap and recovery](../development/ci/workflows/reference-dependency-image-mirror.md#bootstrap-and-recovery).
- **No draft-transition triggers** — no job reads draft state, so a draft transition must not start a run. The [`workflow-topology-policy`](../../.no-mistakes/rules/policies.yml) rule enforces this.
- **Local composite actions follow a checkout** — `./` actions resolve from the workspace, which only a checkout fills. The [`github-actions-local-action-checkout`](../../.no-mistakes/rules/policies.yml) rule enforces this. Do not add a checkout to a job deliberately kept checkout-free (a required fan-in gate) just to dedupe script; weigh runner demand and registry reachability first.
- **Workflow syntax** — `actionlint` runs in CI; run it on changed workflows before pushing.

### Judgment

- **Runner demand** — name the hosted label a new or changed job draws from, prefer the smallest that fits, and justify extra fan-out. Choose `ubuntu-slim` for `gh api`, prompt rendering, and aggregator jobs (no Docker, no `services:`, no Node/pnpm/backend setup); `ubuntu-latest` for Docker, `services:`, or Node/pnpm/backend setup; `ubuntu-24.04-arm` for native ARM64 work matching production (image builds, native-binary smoke tests) and every job sharing a restored web build. Update `.github/runner-policy.json` when runner placement changes. Run `node ci/check-live-workflow-topology.mts` after runner or timeout changes; `pnpm run no-mistakes` alone does not check it.
- **Host ports** — let Docker allocate a host port unless a workflow must coordinate one. In that case use the published vouchington-tooling allocator immediately before binding; a caller that can choose a new port may reallocate once on `EADDRINUSE`.
- **Deploys stay decoupled** — no cross-workflow deploy-order wait or poll; only api and workers share a deploy unit. Application-owned schema follows [One current contract](../../AGENTS.md), not expand/contract. See [deploy decoupling](../overview/infrastructure/deployment.md#deploy-decoupling--independent-safety).
- **Auto Harness admission** — Harness workflows keep only per-target concurrency, which prevents duplicate sessions for one target. The scheduler, not GitHub, bounds running sessions; a global GitHub concurrency group would serialize short jobs without limiting them. See [`harness-dispatch.yml`](https://github.com/vouchington/vouchington-tooling/blob/main/.github/workflows/harness-dispatch.yml).
- **Script portability** — CI is Linux, but scripts shared with local development must also run on the macOS system `/bin/bash`.
- **Security-guard migrations** — before replacing or deleting a security guard, port its old fixture corpus to the replacement and pass it first. Bind policy to immutable SHAs and confirm which inputs an untrusted PR cannot rewrite.
- **Verify** — run `pnpm exec vitest run --project github-actions` for every workflow or composite action change.

## See Also

- [github-actions-checklist skill](../../.agents/skills/github-actions-checklist/SKILL.md) — skill entry point
- [.github/workflows/AGENTS.md](../../.github/workflows/AGENTS.md) — scoped workflow invariants and canonical-doc routing
- [docs/development/ci/README.md](../development/ci/README.md) — CI documentation index
