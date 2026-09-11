# worker-io Entrypoint

Entry point for the IO-bound worker container. It handles queue workers that depend only on
PostgreSQL, Valkey, and external HTTP. Local development always runs this process.

## Queues

IO-capable queues are listed in
[`../../modules/worker-queue-inventory/worker-queue-policy.json`](../../modules/worker-queue-inventory/worker-queue-policy.json).
Local-development queue selection remains split. CPU-only queues must not be added here.

## Files

- `index.mts` — process entrypoint and exported runtime controls
- `runtime.mts` — binds IO definitions to the shared worker lifecycle
- `serve.mts` — prewarm HTTP server (port from `NODE_PREWARM_PORT`; no server starts if unset) and
  graceful-shutdown wiring
- `definitions.mts` — schedule definitions and re-exports worker definitions
- `worker-definitions.mts` — all IO worker definitions

## Related

- Shared worker framework: [../../worker-runtime/](../../worker-runtime/)
- Worker packages: [../../workers/CLAUDE.md](../../workers/CLAUDE.md)
- Queue packages: [../../queues/CLAUDE.md](../../queues/CLAUDE.md)
- Local entrypoint rules: [CLAUDE.md](CLAUDE.md)
