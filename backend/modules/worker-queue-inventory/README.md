# Worker Queue Inventory

This dependency-free package owns the canonical worker queue classification, its pre-install command
boundary, and the complete live queue-name inventory shared by worker entrypoints and Valkey
administration.

- `worker-queue-policy.json` owns policy-managed CPU, I/O, and SQS queue classifications.
- `worker-queue-policy.mts` validates policy and projects queue classifications for Vouchington.
- `worker-queue-policy-cli.mts` exposes those helpers to clean-checkout local tools
  without requiring workspace dependencies to be installed first.
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

The policy command boundary must keep all runtime imports relative and remain inside this
dependency-free package. Its isolated-copy test enforces that it runs before workspace packages have
been installed.
