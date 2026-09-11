# Job Replayability & Idempotency reference

[Back to Job Replayability & Idempotency](JOB-REPLAYABILITY.md)

## Overview

glide-mq runs on Valkey, which is treated as **ephemeral**. If Valkey loses all
data, every job must be re-enqueueable and the system must converge back to its
correct eventual state from the Postgres source-of-truth.

Two requirements enforce this:

1. **Idempotency** — every job handler must be safe to run multiple times. Running
   a handler twice must produce the same result as running it once. Handlers that
   write to Postgres must use upsert, content-sha guards, or uniqueness constraints.

2. **Backfill** — every replayable queue must register a **backfill entry** in
   `BACKFILL_REGISTRY` (`backend/api/v1/mq/backfills-registry.mts`). The backfill
   scans the Postgres source-of-truth and enqueues individual jobs for every entity
   missing a derived result. Backfills are triggerable from `/admin/queues`.
