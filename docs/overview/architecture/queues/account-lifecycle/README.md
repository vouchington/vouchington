# Account lifecycle queue

Source entrypoint: [backend/queues/account-lifecycle/README.md](../../../../../backend/queues/account-lifecycle/README.md)

`account-lifecycle` is a domain of the shared [`background`](../background/README.md) queue. It carries account export, expired-export cleanup, export recovery, user deletion, and deletion recovery as `account-lifecycle.processExportRequest`, `account-lifecycle.processCleanupExpiredExports`, `account-lifecycle.recoverExportRequests`, `account-lifecycle.processUserDeletion`, and `account-lifecycle.recoverUserDeletions`. Each job keeps its existing payload, request/attempt identity, deduplication, retries, and schedule. Normal processing uses priority 10; cleanup and recovery use dispatcher priority 100. Lower numbers run first.

The domain is one domain-wide group of two (ordering key `account-lifecycle`, concurrency two across every worker). This caps simultaneous PostgreSQL and S3-heavy work at two across both families, whereas their former separate workers could run four total. Long exports may therefore delay deletion batches. The durable request rows and five-minute recovery schedules provide the source of truth for lost queue deliveries. Operators can pause the domain, read its stats, and retry its failed jobs through the background domain routes.

Every job carries a ten-minute per-job `lockDuration` (the former worker-level lock); the worker-level 30-second stalled interval is now the shared worker's. Export and deletion request transitions are fenced by their processing attempt IDs. Recovery removes retained completed or failed job records before re-adding an unstarted attempt, while a waiting, delayed, or active job remains the canonical delivery. The recovery and cleanup dispatchers already claim one bounded page per run, so none needed paged continuation jobs.

See the [export jobs](../account-data-requests/README.md), [deletion jobs](../user-deletions/README.md), and [shared worker](../workers/account-lifecycle/README.md) for domain behavior.
