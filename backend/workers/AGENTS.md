# Worker packages

- Load [queue authoring](../../.agents/skills/voucha-queue-authoring/SKILL.md) and [the queue checklist](../../docs/checklists/backend-queues.md) for processor/concurrency/fan-out/retry/backfill/placement changes; load [backend Vitest authoring](../../.agents/skills/backend-vitest-test-authoring/SKILL.md) for tests.
- Each domain registers/processes its matching `@queues/<name>` through `workers.mts`/`workers/*.mts`, `processors.mts`/`processors/*.mts`, and optional `types.mts`. Keep processors thin; services own business logic/durable writes. Workers may import enqueue APIs; queues never import workers.
- Rate-limit-catching OpenAI/Bedrock processors use `return await` inside `try` so async rejection reaches the local handler.
- Update domain docs for behavior/ownership changes; use [inventory](../../docs/overview/architecture/backend/catalogs/README.md#workers), [queues](../queues/AGENTS.md), [CPU](../entrypoints/worker-cpu/AGENTS.md), and [IO](../entrypoints/worker-io/AGENTS.md) owners.
