# Initialization Modes

[Back to Dev Environment Reference](README.md#initialization-modes)

- **`./dev/initialize monorepo`** — installs dependencies and pinned CI tools, and makes the `no-mistakes` npm CLI available; no Docker or DB setup. Use for lint, static-analysis rules, and unit tests only. Dependency installation retries transient `pnpm install` failures.
- **`./dev/initialize backend`** — monorepo + ports, Valkey container, DB, migrations, `.env` — no HTTPS certs, CF Worker env, or other web-only secrets. Enables DB/Valkey-backed backend tests without starting the web stack.
- **`./dev/initialize web`** (default) — full setup: backend + HTTPS certs, CF Worker env, `web/.env.local`, Web Push VAPID keys. Enables all services via `./dev/tmux`. Clears `cloudflare-worker/.wrangler/state/`, `cloudflare-worker/.wrangler/runtime/`, and `web/.next/` so services start fresh — see [Miniflare Cache](reference-miniflare-cache.md#miniflare-cache). Run after `git worktree add`; safe to re-run to repair without reallocating saved resources for the current worktree identity.

Non-main worktree resource identities hash the canonical physical checkout root. Moving a checkout,
or upgrading an `.env` written with the former directory-name identity, makes the saved environment
stale. `./dev/initialize backend`/`web` then allocates fresh ports, database, and Valkey resources and
rewrites `.env`; it does not copy local data or delete the superseded resources. Cleanup removes orphaned
canonical hashed resources but retains legacy-named resources for explicitly verified removal.

After dependency installation, all three modes resolve and import the native addons from their real
consumer workspaces before installing pinned tools, writing `.initialized`, or printing success.
If an addon cannot resolve or load, initialization prints every failed package in a stable order and
a `pnpm install --frozen-lockfile --force` repair command. Run it, then rerun the same initializer
command; the initializer does not repair packages or invoke addon functions automatically. The forced
frozen install restores optional native platform packages as well as lifecycle-built addons.

All three modes require at least 5 GiB free on every distinct host filesystem that backs the worktree,
home directory, or temporary directory. The initializer checks this before cache cleanup, Docker,
PostgreSQL, or dependency installation. A Bash 3.2-compatible, read-only `df` gate checks the
required filesystems before nvm can install the repository Node version. After Node activation, the
comprehensive TypeScript probe checks them again before discovering the pnpm store and, in backend and
web mode, Docker Desktop's backing storage on macOS or Docker's host root on Linux. Failure to resolve
an optional pnpm or Docker path produces a warning, while a resolved filesystem below the floor blocks
setup. Diagnostics provide a shell-quoted `df -h` command and target-specific recovery guidance.
The preflight never deletes files, pnpm packages, or Docker data automatically.

The `.initialized` marker records the strongest completed capability on a three-rung ladder —
`monorepo` < `backend` < `web` — as the exact scalar, rather than the most recently requested mode:
`marker = max(requested, min(existing_marker, strongest_valid_on_disk))`. `strongest_valid_on_disk` is
probed fresh on every run (the stricter web validator, then the backend validator, else `monorepo`), so
a stale marker from a prior run — e.g. `web` after a deleted `cloudflare-worker/.dev.vars`, or re-rolled
`web/.env.local` ports — demotes instead of being trusted blindly. Because `backend` and `web` both
include monorepo setup, and `web` includes backend setup, running a lower mode against an
already-stronger worktree preserves that stronger capability (refreshing only dependencies and pinned
tools) as long as its artifacts still validate; otherwise it records the lower requested mode.
`./dev/reset-worktree` is the intentional invalidation boundary: it removes any stale marker before
initializing the clean worktree as `monorepo`. See the
[getting-started guide](../docs/development/README.md#initialization-capability-marker) for the same
contract in the durable development docs.

If `createdb` or `psql` reports "no such file" or "connection refused", confirm that the host
PostgreSQL 18 service is running (`brew services info postgresql@18` on macOS) and retry with the
authoritative worktree target using `source .env && ./dev/initialize web` (or `backend`, if that's the
capability you need). Inspect `DATABASE_URL` in `.env` first and correct its host or port if needed;
do not replace a custom target with `PGHOST`.

For symptom-specific web validation recovery, see [../docs/development/tests.md § Local Web Validation Recovery](../docs/development/tests.md#local-web-validation-recovery).
