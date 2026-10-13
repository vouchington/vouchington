# Account lifecycle worker

The IO worker handles data exports and user deletions through one `account-lifecycle` queue, with concurrency two and scale ignored. Both families retain their fenced PostgreSQL lifecycle transitions and job-specific retry behavior.

See the [architecture guide](../../../docs/overview/architecture/queues/workers/account-lifecycle/README.md).
