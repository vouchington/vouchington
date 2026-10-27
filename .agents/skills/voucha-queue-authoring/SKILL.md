---
name: voucha-queue-authoring
description: Author Voucha GlideMQ queues, payloads, enqueues, workers, retries, and schedules.
---

# Voucha Queue Authoring

Follow [`docs/checklists/backend-queues.md`](../../../docs/checklists/backend-queues.md) and the
scoped rules under [`backend/queues/`](../../../backend/queues/AGENTS.md),
[`backend/workers/`](../../../backend/workers/AGENTS.md).

1. Before adding a queue, merging queues, or waiting on another job, apply
   [queue boundaries](../../../docs/checklists/backend-queues.md#queue-boundaries).
2. Keep enqueue configuration and payload types in the queue package, processor orchestration in the
   worker package, and business logic and durable idempotency in services.
3. For a fan-out, use the [paged-dispatcher helper](../../../backend/data-stores/valkey-glide-mq/paged-dispatcher.mts);
   follow the [checklist](../../../docs/checklists/backend-queues.md#queue-boundaries).
4. Start from durable source-of-truth state, pass minimal identifiers, mark jobs `sensitive: true`
   when payloads contain secrets or personal data, make every retry safe, and await or explicitly
   mark every fan-out edge.
   Prevent double requests cheaply: re-read the entity's state in PostgreSQL when the job starts,
   use stable job or deduplication IDs, and pass provider idempotency keys. Billing, telemetry,
   and analytics are reporting only: record them, but never read them at runtime to decide, gate,
   or deduplicate work, and never add a reservation key or receipt ledger for paid calls. See the
   [double-request rules](../../../docs/checklists/backend-queues.md#queue-boundaries).
5. Apply the canonical job options, deduplication, backfill, scheduler/admin-trigger, and
   data-driven worker-placement requirements from the checklist. Scheduler templates take no
   `delay`, `deduplication`, `parent`, or `jobId`, and backlog guards count `delayed` jobs too.
   Each continuation step needs a new job or deduplication ID. Scheduled jobs need no overlap
   handling of their own; follow the [queue checklist](../../../docs/checklists/backend-queues.md#queue-boundaries).
6. Give every shared-queue job a domain-prefixed `ordering` key. Its `concurrency` is a global
   cap across workers, read from DynamicConfig; it is not a split of `workerConcurrency`. Put
   floodable families in their own lane and dispatchers in a lane separate from tasks, because
   groups release jobs FIFO, not by priority. A delayed job keeps its slot, so a cap that must
   survive deferral is a lease, not more concurrency; see the checklist.
7. Test service behavior with real PostgreSQL, Valkey, and GlideMQ boundaries; do not mock internal
   queues, workers, services, or data stores.
8. Update the domain README and queue inventory with the implementation.
9. For effectful worker/RPC or financial (Stripe) operations, fill in the
   [durable transition matrix](../../../docs/checklists/backend-queues.md#durable-transition-matrix).

For sweeps and cleanup jobs, apply [bounded-iteration](../bounded-iteration/SKILL.md).

Load the installed `glide-mq` skill only when generic GlideMQ API detail is needed; repository
ownership, replayability, and validation policy remain authoritative here.
