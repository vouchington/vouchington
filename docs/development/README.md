# Getting Started

How to run all services locally and load the site in a browser.

Agent-specific workflow policy lives in [AGENTS.md](../../AGENTS.md). The
[local-site-testing skill](../../.agents/skills/local-site-testing/SKILL.md) is the concise agent
guide for full-site startup, HTTPS Worker access, and local browser validation. This page focuses on
local setup and development commands.

Cross-repository issue mutations follow the
[public repository issue-routing decision](public-repository-issue-routing.md).

Development owner indexes: [CI](ci/README.md), [harness setup](harnesses/README.md),
[PostgreSQL](postgresql/README.md), [Valkey](valkey/README.md), and
[static analysis](quality/static-code-analysis/README.md).

## Prerequisites

### All contributors (monorepo tools: lint, typecheck, unit tests)

- macOS, or glibc-based Linux on x64 or ARM64 (musl distributions such as Alpine are not supported)
- Node.js v26+ — for TypeScript stripping

### Full web stack (running the app, Playwright tests)

All of the above, plus:

- [Docker Desktop](https://docs.docker.com/desktop/) — for Valkey (with Bloom, JSON, Search modules)
- PostgreSQL 18+ — for UUIDv7
- tmux — for `./dev/tmux`
- Claude Code CLI (`claude`), Codex CLI (`codex`), Grok CLI (`grok`), Cursor CLI (`agent` / `cursor-agent`), and OpenCode CLI (`opencode`) are optional development tools. Run them from a separate terminal or an ad hoc tmux window when needed. See [agent-harness parity](agent-harness-parity.md) and the [harness setup index](harnesses/README.md).

Provision host dependencies with
[vouchington-machines](https://github.com/vouchington/vouchington-machines),
then use Voucha's initializer for checkout-owned dependencies and services. See
[system-dependencies.md](system-dependencies.md) for the ownership boundary and required host
capabilities.

## Quick Start

### Lint / unit tests only (no Docker or DB required)

```bash
git clone git@github.com:jonathanong/voucha.git
cd voucha
./dev/initialize monorepo  # installs deps and pinned tooling
```

See [development/tests.md](tests.md) for the full command matrix.

### DB/Valkey-backed backend tests (no full web stack)

```bash
git clone git@github.com:jonathanong/voucha.git
cd voucha
./dev/initialize backend    # monorepo + creates DB, starts Valkey container, runs migrations, writes .env
```

Use this when you need `DATABASE_URL`/Valkey against a real local instance but not the CF Worker,
Next.js, or HTTPS certs. See [development/tests.md](tests.md) for the full command matrix.

### Full web stack

```bash
# 1. Clone and initialize
git clone git@github.com:jonathanong/voucha.git
cd voucha
./dev/initialize            # full setup (alias for ./dev/initialize web)

# 2. Start all services
./dev/tmux                 # one managed session with five service windows

# 3. Open the site
open https://localhost:8787   # CF Worker is the entry point for browser-grade validation
```

If `./dev/tmux` prints `http://localhost:<WORKER_PORT>`, local mkcert certs are missing. Use that URL
only as a process liveness fallback, then install/regenerate certs before validating browser behavior.

`./dev/initialize web` is safe to re-run — it reuses saved ports and resources for the current
worktree identity.

### Initialization Capability Marker

The [initializer](local-development/README.md#initialization-modes) writes `.initialized` as exactly
`monorepo`, `backend`, or `web` — a three-rung ladder (`monorepo` < `backend` < `web`). The value
records the strongest completed capability, not the latest requested mode:
`marker = max(requested, min(existing_marker, strongest_valid_on_disk))`. Because `backend` and `web`
both include monorepo setup, and `web` includes backend setup, a later `./dev/initialize monorepo` (or
`backend`) preserves a stronger existing capability only when its artifacts are still valid for the
current worktree (`.env`, `.valkey-port`, and the database and Valkey ownership metadata for `backend`;
additionally `.dev.vars` and consistent ports across `.env`/`web/.env.local` for `web`); otherwise it
records the lower requested mode. A valid refresh runs no Docker, database, cache-clearing, or other
higher-mode work; start a preserved web environment with `./dev/tmux`, or run DB/Valkey-backed tests
directly against a preserved backend environment.
`./dev/reset-worktree` is the intentional capability-invalidation boundary: it removes any stale
marker before initializing the reset worktree as `monorepo`. Between its hard reset and monorepo
initialization, it deletes worktree-local generated build, coverage, report, and tool-cache output
while preserving dependencies, environment port values, certificates, test authentication, and
host-level caches or service resources. Native build products and generated projects are owned by
[vouchington-clients](https://github.com/vouchington/vouchington-clients). See the [`dev/` cleanup
contract](local-development/README.md#cleanup) for the complete boundary.

## Architecture (Local)

Traffic flows through the Cloudflare Worker, which proxies to Next.js and the backend API:

```
Browser → CF Worker (:8787) → Next.js (:3000)  — pages
                             → Backend (:2900)  — /api/*
                             → Lambdas (:3100)  — image resizing, browser crawl
```

## Shared Secrets

No shared secrets are required to start the local app. `~/voucha.env` is optional and should only
contain credentials for cloud-backed features you are actively testing, such as S3 uploads or real
OpenAI calls. See [local-env-vars.md](local-env-vars.md).

## Dev Commands

See the canonical [`dev/` command catalog](local-development/README.md#command-catalog) for the complete
inventory, public versus internal boundaries, scope and destructiveness, and CLI argument-safety
contract. The setup and full-stack commands used in this getting-started guide are intentionally
repeated above; maintain all other command descriptions in that catalog.

## Running Tests

```bash
source .env
```

See [development/tests.md](tests.md) for the full command matrix.

## Working on a Parallel Branch

Use git worktrees to work on multiple branches simultaneously. Each worktree gets its own ports, database, and Valkey container:

```bash
git worktree add ../worktrees/my-feature -b feature/my-feature
cd ../worktrees/my-feature
./dev/initialize web
./dev/tmux                 # one managed session with five service windows
# Open the CF Worker URL printed by ./dev/tmux; use HTTPS for browser-grade validation
```

Non-main database and Valkey names use a hash of the canonical physical worktree root, not the
branch or directory name. Moving a checkout changes that identity: rerun `./dev/initialize web`,
then use `./dev/cleanup` to remove orphaned canonical hashed resources. Legacy-named resources are
retained for explicit removal after verifying every ordinary clone has migrated. See
[Resource Allocation](local-development/reference-resource-allocation-web-mode.md) for the exact contract.

Agent-created temporary or subagent worktrees are not this path; they go under the OS tmpdir per [Start Of Work](../../.agents/skills/agent-workflow/start-of-work.md).

Run `./dev/tmux` from outside tmux. It creates one session per canonical worktree with windows in this order: `nextjs`, `backend`, `worker`, `cloudflare`, `lambdas`. The `worker` window runs every queue in the worker policy.

See [../../dev/AGENTS.md](../../dev/AGENTS.md) for full worktree documentation.
Agents should also follow [AGENTS.md](../../AGENTS.md) for initialization, validation, git, and PR completion rules.

### Fresh-base planning

The `./dev/check-fresh-base` session hook fetches `origin/main` and compares it with the current
branch before an agent plans or implements work. It reports the branch relation (equal, ahead,
behind, or diverged) and whether the worktree is clean. If the fetch fails or `origin/main` is
missing, freshness is unknown and the agent must retry the fetch before trusting the checkout.

```mermaid
flowchart TD
  A[Compare branch and worktree with origin/main] --> B{Clean and equal?}
  B -->|Yes| C[Proceed]
  B -->|No| D{New task or resumed work?}
  D -->|New task, while planning| E[Read and plan from origin/main]
  E --> F[After plan acceptance: unforced reset-worktree]
  D -->|Resumed work| G[Preserve branch and plan for upstream changes]
  G --> H[After plan acceptance: ./dev/rebase-onto-main]
  D -->|Dirty, unknown, or ambiguous| I[Ask before changing branch state]
```

Plan Mode is read-only with respect to branch history: inspect `origin/main` with `git diff` and
`git show` instead of resetting or rebasing during planning. Once the plan is accepted, use
unforced `./dev/reset-worktree` for a new task that was planned from `origin/main`, or preserve the
branch and run `./dev/rebase-onto-main` for resumed work. Before that publish, read the four refs in [Reading the four refs](../../.agents/skills/agent-workflow/git-and-prs.md#reading-the-four-refs) so a rewritten `origin/<branch>` is not replayed onto local `main`. Both refuse while `SANDBOX_RUNTIME` or
`CURSOR_SANDBOX` is set and a sandbox-protected path differs. Never infer permission to discard
changes or add `--force`.
The agent-specific procedure lives in [Start Of Work](../../.agents/skills/agent-workflow/start-of-work.md);
the hook interface is documented in the [`dev/` command catalog](local-development/README.md#agent-session-hooks).

## Troubleshooting

**Migrations fail after rebase:**

Follow [Ephemeral worktree databases](../../AGENTS.md) before running this.

```bash
source .env && pnpm run db:clean && pnpm run db:migrate
```

**Missing dependencies after rebase:**

```bash
pnpm install
pnpm run syncpack:lint && pnpm run no-mistakes
```

**Views can't be replaced with `CREATE OR REPLACE`:**

```bash
pnpm --dir backend db:migrate -- --forced
```

**`index.lock` / stuck rebase:**

See [git-worktree-locks.md](git-worktree-locks.md) — caused by git auto-maintenance racing with foreground git commands. Recovery: `git rebase --quit`.

**`another ./dev/reset-worktree is running`:**

Another `./dev/reset-worktree` in this worktree is still running. Wait for it to
finish; the kernel releases its lock automatically if the process exits. See
[git-worktree-locks.md](git-worktree-locks.md).

## Dependency Updates

Dependabot (npm/docker/github-actions) and Renovate (the root `package.json`
`packageManager` pnpm pin, `.nvmrc`, and regex-managed version literals) jointly keep dependencies
fresh. Pnpm toolchain updates wait two days and require manual review. See
[dependency-updates.md](dependency-updates.md) for the branch/PR delay, coverage matrix, and how to
add a new pinned binary.

## Reference index

- [Test Helpers](../../backend/test-helpers/README.md)
- [API Fixtures](../../backend/test-helpers/api-fixtures/README.md)
- [Code Statistics Policy](code-statistics.md)
- [Harness Engineering — Agent Observability](harness-engineering.md)
- [Host Locks](host-locks.md)
- [Merge Authority](merge-authority.md)
- [OpenTelemetry — Local Tracing](opentelemetry.md)
- [Sandbox credential deny list](reference-agent-sandbox-credential-deny-list.md)
- [Adding a Trusted/Credentialed CI Job](reference-ci-adding-a-trusted-credentialed-ci-job.md)
- [CI Job Conditions](reference-ci-ci-job-conditions.md)
- [CI Job Timeout Budgets](reference-ci-ci-job-timeout-budgets.md)
- [Coverage Gates](reference-ci-coverage-gates.md)
- [Destructive Manual Workflows](reference-ci-destructive-manual-workflows.md)
- [Diagnosing Binary Download Failures](reference-ci-diagnosing-binary-download-failures.md)
- [Standalone Workflow Checks](reference-ci-standalone-workflow-checks.md)
- [Static Analysis (`static-code-analysis.yml`)](reference-ci-static-analysis-static-code-analysis-yml.md)
- [Test Workflows](reference-ci-test-workflows.md)
- [Workflow Topology Contracts](reference-ci-workflow-topology-contracts.md)
- [Workspace Cross-Reference](reference-ci-workspace-cross-reference.md)
- [Adding a new pinned binary](reference-dependency-updates-adding-a-new-pinned-binary.md)
- [Coverage matrix](reference-dependency-updates-coverage-matrix.md)
- [First-party release-gate exemptions](reference-dependency-updates-first-party-release-gate-exemptions.md)
- [Frozen-install policy](reference-dependency-updates-frozen-install-policy.md)
- [Manually maintained pins](reference-dependency-updates-manually-maintained-pins.md)
- [Pinning style for GitHub Actions](reference-dependency-updates-pinning-style-for-github-actions.md)
- [Related](reference-dependency-updates-related.md)
- [Supply-chain policy](reference-dependency-updates-supply-chain-policy.md)
- [Verifying a Renovate change](reference-dependency-updates-verifying-a-renovate-change.md)
- [DynamicConfig Cleanup](reference-dynamicconfig-cleanup.md)
- [Explain Test Selection and Vitest Ownership](reference-explain-test-selection-and-vitest-ownership.md)
- [Accepted automation CI risk](reference-merge-authority-accepted-automation-ci-risk.md)
- [Automation PR labeling](reference-merge-authority-automation-pr-labeling.md)
- [Decision flow](reference-merge-authority-decision-flow.md)
- [See also](reference-merge-authority-see-also.md)
- [Why "automation" means GitHub Actions](reference-merge-authority-why-automation-means-github-actions.md)
- [Backend Package Scopes](reference-monorepo-backend-package-scopes.md)
- [Cross-References](reference-monorepo-cross-references.md)
- [Global vs. Project Commands](reference-monorepo-global-vs-project-commands.md)
- [Primary Packages](reference-monorepo-primary-packages.md)
- [Test And Tooling Directories](reference-monorepo-test-and-tooling-directories.md)
- [Classification](reference-runtime-timeouts-classification.md)
- [Crash-recovery / stall windows (NOT runtime caps — do not lower)](reference-runtime-timeouts-crash-recovery.md)
- [Cross-tier observation](reference-runtime-timeouts-cross-tier-observation.md)
- [Follow-ups](reference-runtime-timeouts-follow-ups.md)
- [Infra](reference-runtime-timeouts-infra.md)
- [Node HTTP server](reference-runtime-timeouts-node-http-server.md)
- [Principle: SSE / long-lived connection duration under Fargate Spot](reference-runtime-timeouts-principle-sse-long-lived-connection-duration-under-fargate-spot.md)
- [Regression coverage](reference-runtime-timeouts-regression-coverage.md)
- [Related](reference-runtime-timeouts-related.md)
- [Shared undici dispatchers](reference-runtime-timeouts-shared-undici-dispatchers.md)
- [SSE compliance status](reference-runtime-timeouts-sse-compliance-status.md)
- [Tunable performance knobs](reference-runtime-timeouts-tunable-knobs.md)
- [Vendored (do not modify)](reference-runtime-timeouts-vendored.md)
- [AGENTS.md Size Cap](reference-tests-claude-md-and-agents-md-size-cap.md)
- [Test Command Matrix](reference-tests-command-matrix.md)
- [E2E and Visual](reference-tests-e2e-and-visual.md)
- [First-Push Deterministic Preflight](reference-tests-first-push-deterministic-preflight.md)
- [Local Web Validation Recovery](reference-tests-local-web-validation-recovery.md)
- [Playwright Matchers and Helpers](reference-tests-playwright-matchers-and-helpers.md)
- [Schema Checks](reference-tests-schema-checks.md)
- [Smoke Tests](reference-tests-smoke-tests.md)
- [Storybook A11y Exceptions](reference-tests-storybook-a11y-exceptions.md)
- [Test Value and Safe Reduction](reference-tests-value-and-reduction.md)
- [Vitest 5 Pool and Isolate Matrix](reference-tests-vitest-5-pool-matrix.md)
- [Vitest Mock Typing](reference-tests-vitest-mock-typing.md)
- [Vitest Projects](reference-tests-vitest-projects.md)
- [Vitest Worker-Exit Diagnostics](reference-vitest-worker-exit-diagnostics.md)
- [Concurrency model](reference-worker-performance-concurrency-model.md)
- [Native thread pools](reference-worker-performance-native-thread-pools.md)
- [Node process knobs](reference-worker-performance-node-process-knobs.md)
- [Profiling](reference-worker-performance-profiling.md)
- [Related](reference-worker-performance-related.md)
- [Sizing target](reference-worker-performance-sizing-target.md)
- [Valkey Inflight Saturation (issue #4717)](reference-worker-performance-valkey-inflight-saturation-issue-4717.md)
- [Verifying changes](reference-worker-performance-verifying-changes.md)
- [Glide-MQ Testing with TestQueue and TestWorker](testing/backend/glide-mq-testing.md)
- [API Response Factories](../../web/test-helpers/api-responses/README.md)
