# Backend Setup

Workspace instructions: [backend/CLAUDE.md](../../backend/CLAUDE.md). For agent-run full-site
startup and browser validation, use the
[local-site-testing skill](../../.agents/skills/local-site-testing/SKILL.md).

## Install System Dependencies

Provision the host with
[vouchington-machines](https://github.com/vouchington/vouchington-machines),
then see the [system dependency contract](system-dependencies.md) for the capabilities Voucha
expects.

## Shared Secrets

No shared secrets are required to start the local app. `~/voucha.env` is optional and should only
contain credentials for cloud-backed features you are actively testing. See
[local-env-vars.md](local-env-vars.md) for the credentials/config matrix and S3 opt-in setup.

## Setup the App

`dev/initialize` has three modes — pick the one you need:

### Lint / unit tests only (no Docker or DB required)

```bash
./dev/initialize monorepo  # installs deps and pinned tooling
```

Backend test/lint commands are in [development/tests.md](tests.md).

### DB/Valkey-backed backend tests (no full web stack)

```bash
./dev/initialize backend   # monorepo + creates DB, starts Valkey container, runs migrations, writes .env
```

Use this when you need `DATABASE_URL`/Valkey against a real local instance but not the CF Worker,
Next.js, or HTTPS certs. See [development/tests.md](tests.md) for the DB/Valkey-backed test matrix.

### Full web stack

```bash
# From the main repo
./dev/initialize web   # creates DB, starts Valkey container, installs deps/tooling, runs migrations, configures Web Push keys

# Start development
./dev/tmux                 # one managed session with five service windows
# Open https://localhost:8787 in browser (CF Worker is the entry point for browser-grade validation)
```

If `./dev/tmux` prints `http://localhost:<WORKER_PORT>`, local mkcert certs are missing. Use that URL
only as a process liveness fallback, then install/regenerate certs before validating browser behavior.

For working on a separate branch in parallel:

```bash
# Run from the main repo root
git worktree add ../worktrees/my-feature -b feature/my-feature
cd ../worktrees/my-feature
./dev/initialize web
./dev/tmux                 # one managed session with five service windows
# Open the CF Worker URL printed by ./dev/tmux; use HTTPS for browser-grade validation
```

Agent-created temporary or subagent worktrees are not this path; they go under the OS tmpdir per [Start Of Work](../../.agents/skills/agent-workflow/start-of-work.md).

Run `./dev/tmux` from outside tmux. It creates one session per canonical worktree with windows in this order: `nextjs`, `backend`, `worker`, `cloudflare`, `lambdas`.

See [dev/CLAUDE.md](../../dev/CLAUDE.md) for all commands (`./dev/stop-services`, `./dev/status`, `./dev/reset`, `./dev/teardown`, `./dev/cleanup`).

If a PostgreSQL view change cannot be applied with `CREATE OR REPLACE VIEW` alone, rerun the schema update with:

```bash
pnpm --dir backend db:migrate -- --forced
```

That forced mode drops all managed views first, then recreates them from `backend/data-stores/psql/views/` in dependency-safe passes.

For browser push notifications, `./dev/initialize web` reuses `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT` from `~/voucha.env` when present. Otherwise it generates a local VAPID keypair automatically and defaults `WEB_PUSH_SUBJECT` to `mailto:team@voucha.ai`. The subject is the app/operator contact URI, not the user receiving a notification.

For API key checksums and token storage, `./dev/initialize backend` (or `web`) reuses `API_KEY_CHECKSUM_SECRET`, `VOUCHA_OTP_TOKEN_HASH_SECRET`, and `VOUCHA_STORED_SECRET_ENCRYPTION_KEYS` from `~/voucha.env` or an existing worktree `.env` when present. Otherwise it writes default development-only sentence values that are obviously fake.

## Running Tests

```bash
source .env
```

See [development/tests.md](tests.md) for the full command matrix.
