---
name: voucha-queue-authoring
description: Use when adding or changing Voucha GlideMQ queues, enqueue APIs, workers, processors, flows, payloads, retries, deduplication, idempotency, scheduled jobs, backfills, or worker placement.
---

# Voucha Queue Authoring

Follow [`docs/checklists/backend-queues.md`](../../../docs/checklists/backend-queues.md) and the
scoped rules under [`backend/queues/`](../../../backend/queues/CLAUDE.md),
[`backend/workers/`](../../../backend/workers/CLAUDE.md), and
[`backend/flows/`](../../../backend/flows/CLAUDE.md).

1. Keep enqueue configuration and payload types in the queue package, processor orchestration in the
   worker package, business logic and durable idempotency in services, and flow producers in
   `backend/flows/core`.
2. Start from durable source-of-truth state, pass minimal identifiers, make every retry safe, and
   await or explicitly mark every fan-out edge.
3. Apply the canonical job options, deduplication, backfill, scheduler/admin-trigger, and
   data-driven worker-placement requirements from the checklist.
4. Test service behavior with real PostgreSQL, Valkey, and GlideMQ boundaries; do not mock internal
   queues, workers, services, or data stores.
5. Update the domain README and queue inventory with the implementation.
6. For effectful worker/RPC or financial (Stripe) operations, fill in the
   [durable transition matrix](../../../docs/checklists/backend-queues.md#durable-transition-matrix-for-worker-and-rpc-operations).

Load the installed `glide-mq` skill only when generic GlideMQ API detail is needed; repository
ownership, replayability, and validation policy remain authoritative here.
