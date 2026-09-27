# Queue packages

- Load [queue authoring](../../.agents/skills/voucha-queue-authoring/SKILL.md) and [the queue checklist](../../docs/checklists/backend-queues.md) for queues, schedulers, payloads, retries, deduplication, flows, backfills, or placement.
- Each domain owns `config.mts`, `queues.mts`, `types.mts`, and `enqueues.mts`/`enqueues/*.mts`. Business logic belongs in services; execution belongs in sibling workers. Queues are safe for API/worker imports and never import `@workers/*`.
- Entity-listener `enqueueOn*` helpers report errors internally and remain fire-and-forget at service call sites. Other self-reporting/non-propagating wrappers include `BestEffort` in their names; `no-sync-throw-assert-on-async-enqueue` depends on it.
- Every queue has a non-DLQ terminal recovery path: backfill, self-healing/reconciliation dispatcher, or documented accepted loss. Follow [job replayability](../../docs/requirements/platform/JOB-REPLAYABILITY.md#rules-for-new-jobs).
- Update domain docs and [queue inventory](../../docs/overview/architecture/queues/README.md) with behavior changes; use [package inventory](../../docs/overview/architecture/backend/catalogs/README.md#queues) and [worker rules](../workers/AGENTS.md).
