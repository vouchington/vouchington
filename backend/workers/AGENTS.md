# Worker packages

- Load [queue authoring](../../.agents/skills/voucha-queue-authoring/SKILL.md) and [the queue checklist](../../docs/checklists/backend-queues.md) for processor/concurrency/fan-out/retry/backfill/placement changes; load [backend Vitest authoring](../../.agents/skills/backend-vitest-test-authoring/SKILL.md) for tests.
- Dedicated queue domains register through `workers.mts`/`workers/*.mts`; shared-queue domains provide `processors.mts`/`processors/*.mts` to the owning shared worker. Keep processors thin; services own business logic/durable writes. Workers may import enqueue APIs; queues never import workers.
- Rate-limit-catching OpenAI/Bedrock processors use `return await` inside `try` so async rejection reaches the local handler.
- Update domain docs for behavior/ownership changes; use [inventory](../../docs/overview/architecture/backend/README.md), [queues](../queues/AGENTS.md), [CPU](../entrypoints/worker-cpu/AGENTS.md), and [IO](../entrypoints/worker-io/AGENTS.md) owners.
