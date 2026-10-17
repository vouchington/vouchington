# Starting Services

[Back to Dev Environment Reference](README.md#starting-services)

Humans run `./dev/initialize web` then `./dev/tmux` and open `https://localhost:$WORKER_PORT`
(mkcert certs required). If `./dev/tmux` prints an `http://` URL, certs are missing; use it only as a
process liveness fallback. Agents run `source .env` then `./dev/tmux --no-attach`, poll the backend
(`/infra/ping`), lambdas (`/health`), and Next.js ports until ready, and stop with
`./dev/stop-services`, which preserves DB data.

`./dev/tmux` starts one session per physical worktree with `nextjs`, `backend`, `worker`,
`cloudflare`, and `lambdas` windows. The `worker` runs every policy-managed queue
(`WORKER_QUEUE_CLASS=all`, which is mutually exclusive with `QUEUES`, so a `QUEUES` value from `.env`
makes the worker exit at startup). A later `./dev/tmux` against a ready session respawns only dead
or missing windows. `./dev/stop-services` closes the whole managed session; when `docker ps` fails
it warns, still closes tmux, and exits 1, so `./dev/teardown` stops before dropping the database
until Docker is reachable.

Before creating the API and worker windows, `./dev/tmux` builds or reuses the worktree-local
localization database at `.local/localization/catalog.sqlite`. After editing `localization/catalog/`,
stop the session and run `./dev/tmux` again so the revision check rebuilds it.
