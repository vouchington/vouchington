# Data Stores

Source entrypoint: [backend/data-stores/README.md](../../../../../backend/data-stores/README.md)

## Graceful Shutdown

See [docs/overview/architecture/graceful-shutdown.md](../../graceful-shutdown.md) for the full shutdown sequence.

[`graceful-shutdown/index.mts`](../../../../../backend/data-stores/graceful-shutdown/index.mts) owns the SIGTERM/SIGINT handlers and orchestrates teardown in three phases: shutdown callbacks → drain callbacks → data store close. The `gracefulShutdown()` function only closes data store connections (Valkey, PostgreSQL). N-API drain and other subsystem cleanup is handled by entry points (server, worker) via `addGracefulShutdownDrainCallback`.

Do not call `process.exit()` or `process.kill()` in shutdown callbacks or data-store close functions — that bypasses cleanup in remaining callbacks. The force-exit timer is the only place `process.exit()` is allowed.

For connections to close cleanly:

- glide-mq workers: close via `addGracefulShutdownCallback` — call `.close()` on each worker. Do not use glide-mq's `gracefulShutdown()` as its signal handlers conflict with ours.
- glide-mq queues/flow-producers: closed via the registry in [`valkey-core/shutdown.mts`](../../../../../backend/data-stores/valkey-core/shutdown.mts). Always await the startup promise that triggered Queue usage before calling `close()` — `Queue.close()` only closes `this.client` if it is non-null at call time, so mid-creation connections leak if close fires too early.
- @valkey/valkey-glide clients: `client.close()` calls `socket.end()`, a half-close that waits for the server-side FIN. The force-exit timer handles any delayed FIN or lingering NAPI handles (`@glidemq/speedkey`).

## Related

- PostgreSQL: [psql/README.md](../../../../development/postgresql/README.md)
- Valkey: [valkey/AGENTS.md](../../../../../backend/data-stores/valkey/AGENTS.md)
- Backend context: [../AGENTS.md](../../../../../backend/AGENTS.md)

## PostgreSQL index-shape extraction

`@data-stores/psql/migration-runner/index-sql` no longer exports `extractIndexShapes`. The
implementation and its callers now use `extractIndexShapes` from
`vouchington-tooling/sql-ast`; initialize SQL AST support with `initSqlAst()` before calling it.
