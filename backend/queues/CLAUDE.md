# Queue Packages

Each `backend/queues/*` folder owns queue configuration, payload types, and enqueue APIs for one
logical domain. Queue packages are safe for API and worker entrypoints to import; they must not
import `@workers/*`.

Before adding or changing a queue, scheduler, payload, retry, deduplication mode, flow, backfill, or
worker placement, load [voucha-queue-authoring](../../.agents/skills/voucha-queue-authoring/SKILL.md)
and follow the canonical [backend queue checklist](../../docs/checklists/backend-queues.md).

## Scoped invariants

- Queue packages own `config.mts`, `queues.mts`, `types.mts`, and `enqueues.mts` or
  `enqueues/*.mts`; business logic belongs in `@services/*` and execution belongs in the sibling
  `backend/workers/*` package.
- Entity-listener `enqueueOn*` helpers report failures internally and remain fire-and-forget at
  service call sites.
- Any fire-and-forget wrapper that catches/reports its own failures instead of propagating a
  rejection must include `BestEffort` in its name (e.g. `enqueueFooBestEffort`). The pack
  `no-sync-throw-assert-on-async-enqueue` ast-grep rule relies on this naming convention to
  exclude fire-and-forget wrappers from its async-throw-assertion guard.
- Update the domain README and [queue inventory](README.md) whenever queue behavior changes.
- Every queue must define a non-DLQ recovery path for terminal failures — a backfill, a
  self-healing dispatcher/reconciliation job, or a documented accepted-loss exclusion. See
  [JOB-REPLAYABILITY.md § Rules for New Jobs](../../docs/requirements/platform/JOB-REPLAYABILITY.md#rules-for-new-jobs).

## See Also

- Queue package catalog: [../catalogs/README.md#queues](../catalogs/README.md#queues)
- Queue inventory: [README.md](README.md)
- [Worker packages](../workers/CLAUDE.md)
- [Backend context](../CLAUDE.md)
