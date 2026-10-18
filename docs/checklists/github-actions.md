# GitHub Actions Checklist

Use this checklist when adding, removing, or modifying a workflow (`.github/workflows/*.yml`) or composite action.

## Checklist

Enforced rules name their check; the check owns the detail. Judgment calls stay here.

### Enforced

- **Runner labels** — a closed label set keeps hosted-runner demand and architecture deliberate. `runner-policy.test.mts` (allowlist in `runner-policy-classify.mts`) and `build-web-targets-runner-parity.test.mts`.
- **Pinned actions** — a commit SHA stops a re-pointed tag from silently changing what runs. no-mistakes `github-actions-pinned-hash`.
- **Script expressions** — free-form event text interpolated into a script is code injection, so it travels through `env:`. `workflow-script-expressions.test.mts`.
- **Checkout credentials** — a write-capable token must not stay in `.git` for later steps. `checkout-credentials.test.mts`.
- **Docker host ports** — fixed host ports collide on shared hosts. `docker-port-policy.test.mts`.
- **Docker workspace user** — a root-owned write into a bind-mounted workspace breaks later cleanup. The Docker workspace user check in `vouchington-tooling/gha-workspace-policy`, run by `static-code-analysis/repo-file-policy`.
- **Downloads** — unverified binaries are a supply-chain hole. `workflow-download-integrity.test.mts`. Also put the tool version in the downloaded filename or directory so a generic `/tmp` path cannot serve a stale binary (unenforced).
- **Caching** — ephemeral runners make `node_modules` and ad-hoc caches a stale-state risk. `cache-path-policy.test.mts`, `cache-policy.test.mts`.
- **pnpm install** — one install per job, from the shared setup actions, keeps installs fast and script-free where required. `pnpm-install-policy.test.mts` and `pnpm-activation.test.mts`.
- **Concurrency** — an unlocked workflow duplicates runs and a wrong cancel policy drops merge-queue or main work. The `workflow-topology-policy` rule in `.no-mistakes.yml` (reasoned exceptions, cancel intent, group collisions) and the literal area prefix in `area-workflows.test.mts`.
- **Docker Hub images** — anonymous Docker Hub pulls hit its rate limit and ejected unrelated merge-queue entries ([#2653](https://github.com/vouchington/vouchington/issues/2653)); `mirror.gcr.io` serves the same pinned digest without credentials. `docker-hub-mirror.test.mts`. The [Valkey helper](../../.github/actions/start-valkey/pull-image.sh) owns the one documented Docker Hub fallback.
- **No draft-transition triggers** — no job reads draft state, so a draft transition must not start a run. `draft-event-triggers.test.mts`.
- **Local composite actions follow a checkout** — `./` actions resolve from the workspace, which only a checkout fills. `local-action-checkout.test.mts`. Do not add a checkout to a job deliberately kept checkout-free (a required fan-in gate) just to dedupe script; weigh runner demand and registry reachability first.
- **Workflow syntax** — `actionlint` runs in CI; run it on changed workflows before pushing.

The three interim tests above are deleted once jonathanong/no-mistakes#2182 ships the generic rule.

### Judgment

- **Runner demand** — name the hosted label a new or changed job draws from, prefer the smallest that fits, and justify extra fan-out. Choose `ubuntu-slim` for `gh api`, prompt rendering, and aggregator jobs (no Docker, no `services:`, no Node/pnpm/backend setup); `ubuntu-latest` for Docker, `services:`, or Node/pnpm/backend setup; `ubuntu-24.04-arm` for native ARM64 work matching production (image builds, native-binary smoke tests) and every job sharing a restored web build. `runner-policy.test.mts` pins which jobs. Run `node ci/check-live-workflow-topology.mts` after runner or timeout changes; `pnpm run no-mistakes` alone does not check it.
- **Deploys stay decoupled** — no cross-workflow deploy-order wait or poll; only api and workers share a deploy unit. Application-owned schema follows [One current contract](../../AGENTS.md), not expand/contract. See [deploy decoupling](../overview/infrastructure/deployment.md#deploy-decoupling--independent-safety).
- **Auto Harness admission** — Harness workflows keep only per-target concurrency, which prevents duplicate sessions for one target. The scheduler, not GitHub, bounds running sessions; a global GitHub concurrency group would serialize short jobs without limiting them. See [`harness-dispatch.yml`](../../.github/workflows/harness-dispatch.yml).
- **Script portability** — CI is Linux, but scripts shared with local development must also run on the macOS system `/bin/bash`.
- **Security-guard migrations** — before replacing or deleting a security guard, port its old fixture corpus to the replacement and pass it first. Bind policy to immutable SHAs and confirm which inputs an untrusted PR cannot rewrite.
- **Verify** — run `pnpm exec vitest run --project github-actions` for every workflow or composite action change.

## See Also

- [github-actions-checklist skill](../../.agents/skills/github-actions-checklist/SKILL.md) — skill entry point
- [.github/workflows/AGENTS.md](../../.github/workflows/AGENTS.md) — scoped workflow invariants and canonical-doc routing
- [docs/development/ci/README.md](../development/ci/README.md) — CI documentation index
