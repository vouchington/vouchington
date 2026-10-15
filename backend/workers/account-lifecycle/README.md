# Account lifecycle worker

The account lifecycle handlers serve the `account-lifecycle` domain of the shared background worker, under a domain-wide group of two. Both families retain their fenced PostgreSQL lifecycle transitions and job-specific retry behavior.

See the [architecture guide](../../../docs/overview/architecture/queues/workers/account-lifecycle/README.md).
