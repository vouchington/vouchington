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

When running inside the generated `claude` or `codex` tmux window, all services are already running — just `source .env` to get port variables. Start fresh from outside tmux:

```bash
source .env
./dev/tmux
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

`./dev/tmux` starts the `nextjs`, `backend`, `workers-io`, `worker-cpu`, `cloudflare`, `lambdas`, `claude`, and `codex` windows. Outside tmux it attaches automatically; inside tmux, pass `--no-attach` to start without attaching (omitting it exits with an error). Pass `-v` for verbose output. Requires web init; non-destructive.

Use `./dev/tmux-name <name>` to rename the current agent tmux window and pane title (targets `$TMUX_PANE`); pass an empty name to clear the pane title and restore automatic window naming.
