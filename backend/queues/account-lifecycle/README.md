# Account lifecycle queue

The single ranked `account-lifecycle` queue carries export, export cleanup/recovery, and user deletion/recovery jobs. The five distinct job names retain their existing durable request and attempt identities, simple deduplication, priorities, retries, delays, and schedules. `backend/workers/account-lifecycle` consumes them with a shared concurrency cap of two.

See the [architecture guide](../../../docs/overview/architecture/queues/account-lifecycle/README.md).
