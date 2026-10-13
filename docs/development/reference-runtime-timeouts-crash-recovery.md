# Crash-recovery / stall windows (NOT runtime caps — do not lower)

[Back to Runtime Timeouts](runtime-timeouts.md#crash-recovery--stall-windows-not-runtime-caps--do-not-lower)

`glide-mq` `lockDuration` bounds how long a job can go without a heartbeat before another worker
is allowed to pick it up after a crash; the worker auto-renews the lock at `lockDuration / 2`.
These are recovery windows for abnormal termination, not a cap on normal runtime — shortening one
only makes a genuinely slow-but-alive job get re-picked-up (and duplicated) sooner.

| Worker                | File                                                | `lockDuration`                                                                       |
| --------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Account data requests | `backend/workers/account-data-requests/workers.mts` | 600,000                                                                              |
| AI agents (core)      | `backend/workers/ai-agents/workers/core.mts`        | 300,000                                                                              |
| Bloom filters         | `backend/workers/bloom-filters/workers.mts`         | 600,000 (`BLOOM_FILTER_LOCK_DURATION_MS`, `backend/queues/bloom-filters/config.mts`) |
| Article sync          | `backend/workers/article-sync/workers.mts`          | 30,000 (intentional `glide-mq` default; heartbeat every 15,000)                      |

This table covers only `lockDuration`. Bloom filters is the one worker whose queue config also
defines `BLOOM_FILTER_STALLED_INTERVAL_MS` (30,000 — how quickly a stalled job is detected,
`backend/queues/bloom-filters/config.mts`); the other workers' `stalledInterval` (if set) lives
directly in their `workers.mts`, not a shared config file, so it's out of scope for this registry.

The article-sync worker intentionally inherits the `glide-mq` default of 30,000ms (unchanged in 0.16). A healthy
worker renews that lock every 15,000ms, so the lock can remain held for jobs of any duration. The
30-second value controls only how soon another worker may recover the job after heartbeats stop;
it is unrelated to the job's total runtime and independent of the centrally owned 60-second SSE
connection cycle. Size the lock from worker heartbeat and crash-recovery behavior, not the client
connection lifetime.

## Stall budget

Each time a lock lapses and another worker re-picks the job, glide-mq increments the job's
`stalledCount`. The count never resets and does not depend on `attempts`: stall number
`maxStalledCount + 1` fails the job permanently with `job stalled more than maxStalledCount`.
glide-mq defaults `maxStalledCount` to `1`; `createWorker`/`createBatchWorker` default it to `2`
(see [Worker construction](../overview/architecture/backend/data-stores/valkey-glide-mq/README.md#worker-construction)).
A deploy that force-exits the process after `GRACEFUL_SHUTDOWN_PERIOD_SECONDS` while a long job is
still running counts as a stall, so the budget absorbs one deploy plus one slow heartbeat. A worker
may pass its own `maxStalledCount`; raising it hides a job that keeps crashing, so prefer fixing
the job or its `lockDuration`.
