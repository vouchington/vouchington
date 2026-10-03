# Worker Queue Inventory

Source entrypoint: [backend/modules/worker-queue-inventory/README.md](../../../../../../backend/modules/worker-queue-inventory/README.md)

This dependency-free package owns the canonical worker queue classification, the worker queue
classes, and the complete live queue-name inventory shared by worker entrypoints and Valkey
administration.

- `worker-queue-policy.json` owns policy-managed CPU, I/O, and SQS queue classifications.
- `worker-queue-policy.mts` validates policy and projects queue classifications for Vouchington.
- `worker-queue-class.mts` owns the `WORKER_QUEUE_CLASS` values (`all`, `cpu`, `io`). It expands a
  class to an explicit include list from the policy (`all` is the CPU-only plus I/O-capable queues,
  `cpu` the CPU-only queues, `io` the I/O-capable queues) and `resolveQueueSelection` applies the
  entrypoint's accepted classes, rejecting unknown classes and `WORKER_QUEUE_CLASS` combined with
  `QUEUES`. Without a class it also rejects any `QUEUES` name (included or excluded) that the
  caller's known queue names do not contain. Infrastructure passes only the class; the app owns the
  queue lists.
- `UNIVERSAL_WORKER_QUEUE_NAMES` owns queues loaded outside placement selection.
- `SQS_CONSUMER_QUEUE_NAMES` projects the policy's SQS classification for queues that are not GlideMQ queues.
- `policyManagedGlideQueueNames()` is the exact API dashboard inventory contract.
- `allLiveWorkerQueueNames()` combines both inventories for cross-cutting administration.

Keep policy-managed worker definitions exactly aligned with the JSON lists and universal worker
definitions exactly aligned with `UNIVERSAL_WORKER_QUEUE_NAMES`. The entrypoint and worker-runtime
tests enforce both contracts.

The API dashboard intentionally monitors policy-managed GlideMQ queues only. SQS consumers and
universal workers are separate runtime surfaces and are excluded structurally rather than by an
inline dashboard allowlist.

Keep all runtime imports in this package relative so it stays dependency-free.
