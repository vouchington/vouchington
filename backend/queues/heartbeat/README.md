# Heartbeat Queue

Universal queue used for worker liveness checks and low-cardinality queue telemetry.

## Queue

| Queue       | Job name                | Processor                               | Purpose                                                         |
| ----------- | ----------------------- | --------------------------------------- | --------------------------------------------------------------- |
| `heartbeat` | `heartbeat`             | `processHeartbeat`                      | Echoes input data with a `processedAt` timestamp                |
| `heartbeat` | `publish-glidemq-stats` | `publishAggregatedQueueStats` then echo | Publishes class-level GlideMQ depth and staleness to CloudWatch |

## Enqueue

`enqueueHeartbeat(data?)` — enqueues a single heartbeat job. Used from CI Docker
smoke tests and Playwright global setup to confirm the worker is processing jobs
before the test suite runs.

`enqueueGlideMqStats()` — enqueues the queue-metrics publisher. `worker-cpu` owns one
five-minute schedule for this job; the universal heartbeat worker may process it, while
local and test environments make the CloudWatch publication a no-op.

## Related

- Worker: [`../../workers/heartbeat/README.md`](../../workers/heartbeat/README.md)
- Universal worker runtime: [`../../worker-runtime/README.md`](../../worker-runtime/README.md)
