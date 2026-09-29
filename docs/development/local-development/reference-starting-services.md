# Starting Services

[Back to Dev Environment Reference](README.md#starting-services)

### Humans — `./dev/tmux` (recommended)

```bash
git worktree add ~/worktrees/my-feature -b feature/my-feature
cd ~/worktrees/my-feature
./dev/initialize web
./dev/tmux
```

Open at `https://localhost:$WORKER_PORT` for browser-grade validation (mkcert certs required). If
`./dev/tmux` prints `http://localhost:$WORKER_PORT`, use it only as a process liveness fallback, then
install/regenerate mkcert certs before validating browser behavior.

### Agents

Agent shells are separate from the managed service session. Initialize the web stack,
then start it without attaching:

```bash
source .env
./dev/tmux --no-attach
```

Health check endpoints to poll until ready:

- Backend: `http://localhost:$PORT/infra/ping`
- Lambdas: `http://localhost:$IMAGE_LAMBDA_PORT/health`
- Next.js: `http://localhost:$NEXT_PORT`
- CF Worker: `https://localhost:$WORKER_PORT` for browser validation; `http://localhost:$WORKER_PORT`
  only when `./dev/tmux` reports the missing-cert fallback

Stop this worktree's services without dropping DB data:

```bash
./dev/stop-services
```

### Tmux Flags And Window Naming

`./dev/tmux` starts one session per physical worktree with `nextjs`, `backend`,
`worker`, `cloudflare`, and `lambdas` windows. The `worker` runs every policy-managed
queue. Outside tmux it attaches automatically; inside tmux, pass `--no-attach` to
start without attaching. Pass `-v` for verbose output. Requires web init.
Concurrent starts wait until the first invocation has created all five windows.
A later `./dev/tmux` against an already-ready session checks that each managed window still has a
live child of the pane shell and respawns or recreates only the dead or missing windows. A waiter
that arrives while windows are still being created does not treat empty children as a crash.
`./dev/stop-services` closes the whole managed session, including windows added manually. If run
from one of those windows, it waits until the calling command finishes before closing the session;
this lets `./dev/reset`, `./dev/teardown`, and `./dev/reset-worktree` finish their remaining work.

Before creating the API and worker windows, `./dev/tmux` builds or reuses the ignored
worktree-local localization database at `.local/localization/catalog.sqlite` and passes that same
path to both processes. The catalog helper anchors its default source and artifact to the worktree,
even when invoked from a subdirectory. Healthy reuse skips that rebuild. After editing `localization/catalog/`,
stop the tmux session and run `./dev/tmux` again; the catalog-and-package revision check rebuilds
the database before those processes start. Restoring a dead `backend` or `worker` window rebuilds
the catalog for that restart only.

Use `./dev/tmux-name <name>` to rename the current agent tmux window and pane title (targets `$TMUX_PANE`); pass an empty name to clear the pane title and restore automatic window naming.
