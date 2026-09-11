# Heartbeat Worker

Universal worker that runs on every deployment (both `worker-cpu` and `worker-io`).
Processes heartbeat jobs to verify the worker is alive and consuming jobs.
The worker-cpu also schedules a low-cardinality GlideMQ queue-metrics job on this universal queue;
its processor publishes class-level CloudWatch metrics in deployed environments.

## Worker

| Queue       | Concurrency | Purpose                                      |
| ----------- | ----------- | -------------------------------------------- |
| `heartbeat` | 1           | Echo input data with `processedAt` timestamp |

The heartbeat worker is loaded via `UNIVERSAL_WORKER_DEFINITIONS` in
`@backend/worker-runtime` and is intentionally excluded from
`worker-queue-policy.json` to bypass the cpu/io partition invariant.

## Related

- Queue: [`../../queues/heartbeat/README.md`](../../queues/heartbeat/README.md)
- Universal worker runtime: [`../../worker-runtime/README.md`](../../worker-runtime/README.md)
