# @modules/queue-config

Shared helpers for sizing glide-mq workers in a single Node process.

## Why

The worker process hosts ~34 glide-mq workers in one Node process. Without a shared sizing helper,
each `Worker(...)` constructor either hard-codes `concurrency` or reads a one-off env var, so it is
hard to scale them together for different deployment shapes (1 vCPU dev box, 2 vCPU Fargate task,
4 vCPU stress test). The helper standardizes the env knobs and enforces a hard ceiling.

## Exports

### `getWorkerConcurrency(name, opts)`

Resolves the concurrency for a worker named `name`:

1. If `WORKER_CONCURRENCY_<NAME>` is set, return it (clamped by `max`).
2. Otherwise return `round(baseline * WORKER_CONCURRENCY_SCALE)`, clamped to `[1, max]`.

`max` defaults to `25` and can be raised or lowered globally with `WORKER_CONCURRENCY_MAX`. Pass
`ignoreScale: true` for workers whose concurrency should not move with the global scale knob (for
example `psql`, which serializes itself, or `kagiSmallWeb`, which is bound by an upstream API rate
limit).

```ts
import { Worker } from 'glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'

new Worker(QUEUE_NAME, processFoo, {
  connection,
  concurrency: getWorkerConcurrency('foo', { baseline: 5 }),
})
```

The `name` is normalized to `SCREAMING_SNAKE_CASE`, so `getWorkerConcurrency('aiAgents', ...)`
reads `WORKER_CONCURRENCY_AI_AGENTS`.

### `parseEnvPositiveInt(name, defaultValue, env?)`

Parses a positive integer env var with a default fallback. Throws on non-positive or non-numeric
values so misconfiguration fails loudly at boot.

## Env knobs

| Env var                     | Effect                                                     |
| --------------------------- | ---------------------------------------------------------- |
| `WORKER_CONCURRENCY_SCALE`  | Multiplier on every worker's baseline. Default `1`.        |
| `WORKER_CONCURRENCY_MAX`    | Configurable ceiling for every worker. Default `25`.       |
| `WORKER_CONCURRENCY_<NAME>` | Per-worker override. Bypasses scale; still clamped by max. |

## Related

- Worker process: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
- System file structure: [../../queues/CLAUDE.md](../../queues/CLAUDE.md)
- Performance tuning: [../../../docs/development/worker-performance.md](../../../docs/development/worker-performance.md)
