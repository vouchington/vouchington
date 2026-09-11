# Worker Packages

Each `backend/workers/*` folder owns registrations and processors for the matching
`@queues/<name>` package. Workers may import enqueue APIs; queues must not import workers.

Before changing processors, concurrency, fan-out, retry classification, backfills, or placement,
load [voucha-queue-authoring](../../.agents/skills/voucha-queue-authoring/SKILL.md) and follow the
canonical [backend queue checklist](../../docs/checklists/backend-queues.md). Load
[backend-vitest-test-authoring](../../.agents/skills/backend-vitest-test-authoring/SKILL.md) for
tests.

## Scoped invariants

- Worker packages own `workers.mts` or `workers/*.mts`, `processors.mts` or `processors/*.mts`, and
  optional `types.mts`. Keep processors thin; business logic and durable writes belong in services.
- In processors that catch OpenAI or Bedrock rate limits, use `return await` inside the `try` so an
  asynchronous rejection reaches the local rate-limit handler.
- Update the matching worker README when its behavior or ownership changes.

## See Also

- Worker package catalog: [../catalogs/README.md#workers](../catalogs/README.md#workers)
- [Queue packages](../queues/CLAUDE.md)
- [CPU entrypoint](../entrypoints/worker-cpu/CLAUDE.md)
- [IO entrypoint](../entrypoints/worker-io/CLAUDE.md)
- [Backend context](../CLAUDE.md)
