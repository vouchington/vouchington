# Worker Runtime

Source entrypoint: [backend/worker-runtime/README.md](../../../../../backend/worker-runtime/README.md)

Shared Vouchington composition layer loaded by both `worker-cpu` and `worker-io` entrypoints. The
published `@vouchington/worker-runtime` package owns generic queue parsing, GlideMQ worker
selection/loading, and schedule registration. This package retains Vouchington-specific SQS,
observability, lifecycle, inventory, and universal worker composition.

## Worker Loading

Two loading paths exist:

| Path              | File                       | Description                                                                                                                       |
| ----------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Policy-driven** | `worker-queue-policy.json` | Workers for queues in `WORKER_DEFINITIONS`. Filtered by `WORKER_QUEUE_CLASS` or `QUEUES`. Enforced by cpu/io partition invariant. |
| **Universal**     | `universal-workers.mts`    | Workers loaded unconditionally on every deployment, bypassing queue selection and the cpu/io partition.                           |

### Queue Selection

`lifecycle.mts` resolves the process's queue selection once, with `resolveQueueSelection` from
[`worker-queue-class.mts`](../../../../../backend/modules/worker-queue-inventory/worker-queue-class.mts),
and passes the same selection to the GlideMQ and SQS loaders and to schedule registration, so no
path reads `process.env.QUEUES` itself. `WORKER_QUEUE_CLASS` (`all`, `cpu`,
`io`) expands to an explicit include list from the policy, which both reaches queues that require
explicit inclusion and lets one list select SQS consumers alongside GlideMQ workers. Each
entrypoint states which classes it accepts (`worker-cpu`: `all`, `cpu`; `worker-io`: `io`). Without
a class, `QUEUES` selects queues by name, and every name it lists (an include `name` or an exclude
`-name`) must be a queue this process defines: its worker definitions, SQS consumer definitions, or
universal workers. Setting both, an unknown class, a class the entrypoint does not accept, or a
`QUEUES` name the process does not know fails at startup with an error listing the unknown names.

### Universal Workers

Universal workers run regardless of `WORKER_QUEUE_CLASS` and `QUEUES`. Use universal workers for
cross-cutting concerns such as liveness heartbeats.

Currently registered universal workers:

| Queue       | Package              | Purpose                                                                                   |
| ----------- | -------------------- | ----------------------------------------------------------------------------------------- |
| `heartbeat` | `@workers/heartbeat` | No-op job that echoes input with a timestamp; used for CI smoke tests and liveness probes |

**Design note:** universal workers must NOT appear in `worker-queue-policy.json`
or any `WORKER_DEFINITIONS` array — doing so would break the cpu/io partition
invariant test (`worker-queue-policy.test.mts`). Their names instead live in
`UNIVERSAL_WORKER_QUEUE_NAMES`; `allLiveWorkerQueueNames()` combines that inventory with every
policy-managed queue for cross-cutting administration such as Valkey diagnostics and flushes.

## Entrypoint Lifecycle

`lifecycle.mts` owns the startup sequence shared by the CPU and IO entrypoints. It derives the
queues the process can run, resolves and validates the queue selection against them, loads policy
workers, universal workers, and SQS consumers in parallel, then returns a starter that wires
observability and runs schedule registration alongside service setup. Entrypoints provide only their
definitions and optional process-specific hooks.

```mermaid
flowchart LR
  Definitions[Entrypoint definitions] --> Load[Load workers and SQS consumers]
  Load --> Hooks[Run optional after-load hook]
  Hooks --> Start[Wire listeners]
  Start --> Setup[Register schedules and initialize services]
  Setup --> Success[Run optional one-time success hook]
```

Startup setup failures are reported after both setup operations settle. A process-specific success
hook runs only after both operations succeed; if that hook fails, the failure is reported and a
later call may retry it.

## Queue Policy

[`worker-queue-policy.json`](../../../../../backend/modules/worker-queue-inventory/worker-queue-policy.json) is the
source of truth for canonical CPU-only, I/O-capable, and SQS-consumer queue classifications.
Infrastructure owns worker service names, task definitions, capacity, and deployment routing.
Local development starts the merged `worker-cpu` entrypoint with every policy-managed queue.

Every policy-managed definition must appear in exactly one queue class. The worker policy tests
enforce class alignment, full coverage of the local entrypoints, and the invariant that
`worker-cpu` can load all queues.

## Files

| File                    | Purpose                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `lifecycle.mts`         | Shared worker loading, startup, reporting, and process hook sequence |
| `universal-workers.mts` | `UNIVERSAL_WORKER_DEFINITIONS`, `loadUniversalWorkers`               |
| `observability.mts`     | `addWorkerEventListeners`, job-completion logging                    |
| `scrub-job-data.mts`    | `scrubJobData` — PII/secret redaction for logged job payloads        |
| `setup.mts`             | `setup` — Valkey/glide-mq connection initialization                  |
| `logger.mts`            | Shared worker-runtime logger                                         |
| `sqs-consumer.mts`      | Queue selection, loading, consumer factory, and lifecycle            |
| `index.mts`             | Re-exports package queue/schedule contracts and local composition    |

## Observability

`addWorkerEventListeners` reports worker lifecycle events and queue job progress to analytics.
Failed jobs also pass through the shared backend `onError` handler with Sentry tags for `queue`,
`job_name`, and `job_id`, plus the configured retry `attempts` when available and `job_data`. Both
the deployed `job failed:` log and Sentry extra run `job_data` through `scrubJobData` (see
`scrub-job-data.mts`) before including it: PII/secret-shaped keys (emails, tokens, addresses,
phone numbers, names, etc.) and any other free-text string are replaced with `[Filtered]`; booleans,
numbers, UUID/ULID-shaped ids, and short enum-like strings pass through unchanged. Object keys are
capped at 32 (sorted) and arrays at 10 items, four levels deep, to bound payload size. Local
development `WorkerLogger` still prints unscrubbed, truncated job data — that path is off on
staging and production.

## See Also

- Worker entrypoints: [`../entrypoints/worker-cpu/`](../../../../../backend/entrypoints/worker-cpu/AGENTS.md),
  [`../entrypoints/worker-io/`](../../../../../backend/entrypoints/worker-io/AGENTS.md)
- Queue packages: [`../queues/AGENTS.md`](../../../../../backend/queues/AGENTS.md)
- Worker packages: [`../workers/AGENTS.md`](../../../../../backend/workers/AGENTS.md)
- Worker queue inventory and placement policy:
  [`../modules/worker-queue-inventory/README.md`](../../backend/modules/worker-queue-inventory/README.md)
- Heartbeat queue: [`../queues/heartbeat/README.md`](../heartbeat/README.md)
- Heartbeat worker: [`../workers/heartbeat/README.md`](../workers/heartbeat/README.md)
