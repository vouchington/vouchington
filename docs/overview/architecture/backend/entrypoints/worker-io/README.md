# worker-io Entrypoint

Source entrypoint: [backend/entrypoints/worker-io/README.md](../../../../../../backend/entrypoints/worker-io/README.md)

Entry point for the IO-bound worker container. It handles queue workers that depend only on
PostgreSQL, Valkey, and external HTTP. Production may run this process separately; local
development uses the merged worker-cpu process.

## Queues

IO-capable queues are listed in
[`../../modules/worker-queue-inventory/worker-queue-policy.json`](../../../../../../backend/modules/worker-queue-inventory/worker-queue-policy.json).
Local development does not start this process. CPU-only queues must not be added here.

## Files

- `index.mts` — process entrypoint and exported runtime controls
- `runtime.mts` — binds IO definitions to the shared worker lifecycle
- `serve.mts` — prewarm HTTP server (port from `NODE_PREWARM_PORT`; no server starts if unset) and
  graceful-shutdown wiring
- `definitions.mts` — schedule definitions and re-exports worker definitions
- `worker-definitions.mts` — all IO worker definitions

## Related

- Shared worker framework: [../../worker-runtime/](../../../../../../backend/worker-runtime/)
- Worker packages: [../../workers/AGENTS.md](../../../../../../backend/workers/AGENTS.md)
- Queue packages: [../../queues/AGENTS.md](../../../../../../backend/queues/AGENTS.md)
- Local entrypoint rules: [AGENTS.md](../../../../../../backend/entrypoints/worker-io/AGENTS.md)
