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
| Article sync          | `backend/workers/article-sync/workers.mts`          | 30,000 (intentional `glide-mq` 0.15.3 default; heartbeat every 15,000)               |

This table covers only `lockDuration`. Bloom filters is the one worker whose queue config also
defines `BLOOM_FILTER_STALLED_INTERVAL_MS` (30,000 — how quickly a stalled job is detected,
`backend/queues/bloom-filters/config.mts`); the other workers' `stalledInterval` (if set) lives
directly in their `workers.mts`, not a shared config file, so it's out of scope for this registry.

The article-sync worker intentionally inherits `glide-mq` 0.15.3's 30,000ms default. A healthy
worker renews that lock every 15,000ms, so the lock can remain held for jobs of any duration. The
30-second value controls only how soon another worker may recover the job after heartbeats stop;
it is unrelated to the job's total runtime and independent of the centrally owned 60-second SSE
connection cycle. Size the lock from worker heartbeat and crash-recovery behavior, not the client
connection lifetime.
