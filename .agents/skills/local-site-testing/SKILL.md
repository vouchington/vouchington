---
name: local-site-testing
description: |
  Set up, start, inspect, and test the Voucha local web stack. Use when Codex or
  Claude needs to run the site locally, open browser/UI flows, use the managed
  ./dev/tmux stack, recover local web validation failures,
  avoid descriptor leaks, or verify Cloudflare Worker HTTPS routing.
user-invocable: true
---

# Local Site Testing

Use this skill for full-site local validation. It complements the repo workflow in
[agent-workflow](../agent-workflow/SKILL.md) and the command reference in
[dev/README.md](../../../dev/README.md).

## Setup

Start from the current worktree root.

```bash
./dev/initialize web
source .env
```

`./dev/initialize web` is required for full-site work. It installs deps/tooling, assigns
worktree ports, creates `.env`, starts the worktree Valkey container, prepares PostgreSQL, runs
migrations, and clears stale Next.js/Wrangler runtime output.

If setup fails because Docker, PostgreSQL, host auth, browser permissions, or local sockets are
outside the agent sandbox, retry the exact command outside the sandbox before calling it blocked.
Confirm local state with:

```bash
./dev/status
```

## Start Services

Start the managed stack from outside tmux:

```bash
./dev/tmux
```

If you are already inside a generated `claude` or `codex` tmux window, `./dev/tmux` was run
from outside tmux to create the service windows. Do not run `./dev/tmux` again from inside tmux;
source `.env`, inspect the existing service windows, and open the Cloudflare Worker URL printed by
`./dev/tmux`. For browser-grade validation, that URL must be `https://localhost:$WORKER_PORT`. If
`./dev/tmux` prints `http://localhost:$WORKER_PORT`, mkcert certs are missing; use that HTTP URL only
as a process liveness fallback, then run the local setup script or regenerate `dev/certs/localhost*.pem`
before validating browser behavior. If the service windows do not exist, leave tmux and run
`./dev/tmux` from outside tmux. Do not start or restart individual web services manually; recover
the managed stack with the lifecycle commands in [`dev/README.md`](../../../dev/README.md).

The Cloudflare Worker is the only supported browser entry point. Use HTTPS for full-site validation:

```bash
https://localhost:$WORKER_PORT
```

Do not test the site through direct Next.js URLs. Direct `http://localhost:$NEXT_PORT` bypasses
edge auth, CSP, cache behavior, and `/api/*` routing. Prefer HTTPS for local Worker access because
browser APIs and production parity depend on secure-context behavior. If the managed launcher falls
back to `http://localhost:$WORKER_PORT`, fix local cert setup before treating browser test failures
as application failures.

Use the available browser tool or a normal browser to open that URL. Do not use `open`/`xdg-open`
from an agent shell unless the user approved GUI commands.

Poll these endpoints while services warm up:

- Backend: `http://localhost:$PORT/infra/ping`
- Lambdas: `http://localhost:$IMAGE_LAMBDA_PORT/health`
- Next.js: `http://localhost:$NEXT_PORT`
- Cloudflare Worker: `https://localhost:$WORKER_PORT` for browser validation, or the
  `http://localhost:$WORKER_PORT` fallback printed by `./dev/tmux` only while diagnosing missing certs

## Descriptor Hygiene

Do not launch background service processes from an agent shell; use the managed tmux panes. For
normal local service cleanup, run:

```bash
./dev/stop-services
```

When Wrangler logs `EMFILE` or browser checks fail under descriptor pressure, inspect
`cloudflare-worker/.wrangler/runtime/` logs, stop extra service copies, and confirm cleanup:

```bash
./dev/stop-services
./dev/status
```

If you still need an interactive site after cleanup, restart the whole stack with `./dev/tmux` from
outside tmux. Restarting only Wrangler leaves the Worker proxying to stopped upstreams. For
Playwright specifically, keep Valkey running and retry with one worker:

```bash
./dev/stop-services --keep-valkey
PLAYWRIGHT_MAX_WORKERS=1 pnpm run test:playwright
```

## Test Locally

Use web init for every full-stack or browser test:

```bash
source .env
pnpm run test:web-api
pnpm run test:integration:web
pnpm run test:playwright
pnpm run test:cloudflare-worker
pnpm run test:smoke:cloudflare-worker
```

Playwright and web-integration automation build production-style targets and start their own
servers. Stop dev-loop services first when a test command needs exclusive ports:

```bash
./dev/stop-services --keep-valkey
```

For local recovery symptoms and exact follow-up commands, read
[docs/development/tests.md](../../../docs/development/tests.md#local-web-validation-recovery).
