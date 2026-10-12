# Account lifecycle queue

Source entrypoint: [backend/queues/account-lifecycle/README.md](../../../../../backend/queues/account-lifecycle/README.md)

The ranked `account-lifecycle` queue carries account export, expired-export cleanup, export recovery, user deletion, and deletion recovery. Each job keeps its existing payload, request/attempt identity, deduplication, retries, and schedule. Both recovery jobs use priority 100; normal processing and cleanup use priority 10. Lower numbers run first.

The shared IO worker has concurrency two and ignores global scale. This caps simultaneous PostgreSQL and S3-heavy work at two across both families, whereas their former separate workers could run four total. Long exports may therefore delay deletion batches. The durable request rows and five-minute recovery schedules provide the source of truth for lost queue deliveries.

The queue retains a ten-minute lock duration and 30-second stalled interval. Export and deletion request transitions are fenced by their processing attempt IDs. Recovery removes retained completed or failed job records before re-adding an unstarted attempt, while a waiting, delayed, or active job remains the canonical delivery.

See the [export jobs](../account-data-requests/README.md), [deletion jobs](../user-deletions/README.md), and [shared worker](../workers/account-lifecycle/README.md) for domain behavior.
