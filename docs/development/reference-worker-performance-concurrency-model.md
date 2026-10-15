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
knob (`psql`, `kagi-smallweb` — they serialize themselves or hit an
upstream rate-limited API). `account-lifecycle` (baseline 2) and `article-sync` (baseline 1) were
such workers; as domains of the shared `background` worker they add 3 to its summed baseline,
which scales, and keep their old caps as domain-wide groups of 2 and 1.

`vote-aggregation` is a domain of the shared `background` worker with baseline 10 (it adds 10 to the worker's summed baseline): election tallies, vote weights, vote integrity, topic ratings, metric refresh, and report integrity. The former six baseline-5 workers could run 30 jobs concurrently; a domain-wide group of 10 keeps the former cap, so a backlog here cannot take the background worker's other slots. `WORKER_CONCURRENCY_VOTE_AGGREGATION` no longer exists; use `WORKER_CONCURRENCY_BACKGROUND`.

`activitypub` shares one baseline-10 IO worker across outbound distribution/delivery and inbound durable inbox processing. The prior two baseline-5 workers also allowed ten jobs in total; the shared pool keeps that aggregate limit while allowing either direction to use idle slots. Bursts in either direction can delay the other, and each outbound distribution activity retains its own concurrency-one ordering lane.

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
entry with `-` to run every queue except those names. Every name, included or excluded, must be a
queue the running entrypoint's `WORKER_DEFINITIONS`, `SQS_CONSUMER_DEFINITIONS`, or universal
workers define. A name outside that set (a typo, a retired queue, or a queue only the other
entrypoint runs) fails the process at startup with an error listing the unknown names, the same way
setting `WORKER_QUEUE_CLASS` together with `QUEUES` does. Deployed task definitions pass only the
class, so the app is the only source of queue names there; a deployed `QUEUES` value that names a
queue the image does not define crashes the worker at startup. The image smoke test derives its
exclude list from the image's own `WORKER_DEFINITIONS`, so it always names queues the image knows.
