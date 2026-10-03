# Concurrency model

[Back to Worker Performance](worker-performance.md#concurrency-model)

Every worker is constructed with `concurrency: getWorkerConcurrency(name, { baseline })` from
[`@modules/queue-config`](../overview/architecture/backend/modules/queue-config/README.md). The helper resolves
concurrency in this order:

1. `WORKER_CONCURRENCY_<NAME>` env override (clamped by max).
2. Otherwise `round(baseline * WORKER_CONCURRENCY_SCALE)`, clamped to `[1, max]`.

`max` defaults to `25` and can be lowered globally via `WORKER_CONCURRENCY_MAX`. The
`docs/overview/architecture/queues/README.md` Active Workers table is the source of truth for baselines; worker
index tests in `backend/entrypoints/worker-cpu/` and `backend/entrypoints/worker-io/` lock
baselines to the helper's resolution behavior.

`ignoreScale: true` is reserved for workers whose concurrency must not move with the global scale
knob (`psql`, `account-data-requests`, `kagi-smallweb` — they serialize themselves or hit an
upstream rate-limited API).

### Worker env knobs

| Env var                     | Effect                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `WORKER_CONCURRENCY_SCALE`  | Float multiplier on every worker's baseline. Default `1`.                               |
| `WORKER_CONCURRENCY_MAX`    | Hard ceiling for every worker. Default `25`.                                            |
| `WORKER_CONCURRENCY_<NAME>` | Per-worker override (bypasses scale, still clamped by max). `<NAME>` is the worker key. |

Queue placement and deployment sizing are defined in
[`backend/modules/worker-queue-inventory/worker-queue-policy.json`](../../backend/modules/worker-queue-inventory/worker-queue-policy.json).
Vouchington does not publish runtime worker images. Pull-request builds validate the `worker-cpu`
container target locally. The checked-in `WORKER_IO_AUTOMATION_ENABLED` flag in
[`.github/worker-io-automation.env`](../../.github/worker-io-automation.env)
is false by default; setting it to `true` adds the `worker-io` target to pull-request validation but
does not publish or deploy it. The private `vouchington-infra` receiver owns worker image builds,
publication, retention, deployment manifests, deployed task sizing, and each task definition's
`WORKER_QUEUE_CLASS` value. Local development runs every policy-managed queue in one worker process.
CPU-only queues can run only in `worker-cpu`, and every deployed environment must select every queue
in exactly one worker process.

`WORKER_QUEUE_CLASS` (`all`, `cpu`, or `io`) is how infrastructure picks the queues a worker process
constructs. The worker expands the class to an explicit include list from
`worker-queue-policy.json`: `cpu` is the CPU-only queues, `io` is the I/O-capable queues (including
the SQS consumers), and `all` is both. The explicit list also reaches queues that require explicit
inclusion, which an unset selection skips. `worker-io` accepts only `io` and `worker-cpu` accepts
`all` or `cpu`. An unknown or unaccepted class, or setting `QUEUES` together with it, fails the
process at startup.

`QUEUES` is the name-level selector for local development and the image smoke test, and is used
instead of the class. Use comma-separated queue names to include only those queues, or prefix every
entry with `-` to run every queue except those names.

An include-mode `QUEUES` entry the running process's compiled `WORKER_DEFINITIONS` don't recognize
is dropped rather than treated as fatal — the process starts and runs the queues it does know,
and reports the drop as a warning (`recordWorkerQueueTopologySkew`, `@modules/on-error`). This
tolerates deploy/rollback topology skew when a private-infrastructure task definition briefly leads
or lags the queues implemented by an already-running image. A real typo in the queue policy is
caught at CI time by `backend/entrypoints/worker-cpu/__tests__/worker-queue-policy.test.mts`, not by
this runtime check.
