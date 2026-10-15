# Background Worker

Source entrypoint: [backend/workers/background/README.md](../../../../../../backend/workers/background/README.md)

One worker serves every domain of the [background queue](../background/README.md). Its concurrency is
the combined baseline of the domains it replaced, resolved through `getWorkerConcurrency` like any
other worker (`WORKER_CONCURRENCY_BACKGROUND` overrides it).

## Exports

- `backgroundWorker` (`workers.mts`) - the singleton the IO entrypoint loads.
- `createBackgroundWorker(options)` (`create-worker.mts`) - the factory. `domains` serves only the
  listed domains and parks a registered job of any other domain; tests use it, production serves all.
  `prefix` isolates the queue key prefix.
- `createBackgroundProcessor(handlers)` (`process-job.mts`) - the processor.
- `buildHandlerMap(handlers, domains?)` (`handler-map.mts`) - maps job names to handlers and fails
  loudly when the registry and the handlers disagree.
- `BACKGROUND_HANDLERS` (`handlers.mts`) - every domain's handlers, each exported by
  `@workers/<domain>/handlers`.

## Processor

For each job the processor looks up the handler by `job.name`, checks the domain's pause state
through [`@services/queue-domain-controls`](../../../services/queue-domain-controls/README.md), and
runs the handler. A job whose domain is paused, or whose handler throws `Worker.RateLimitError`,
is deferred without spending an attempt: `job.rateLimitGroup` for a domain-wide group,
`job.moveToDelayed` otherwise. `RateLimitError` itself never reaches GlideMQ because it would idle
the whole shared worker. An unregistered name fails as unrecoverable.

The worker also subscribes to pause changes, so an operator's pause clears the cached state before
the cache lifetime ends. Closing the worker closes the subscription.

## Tests

The real-GlideMQ tests under `backend/workers/background/__tests__` use an isolated queue per test
and wait on worker events: pause and resume defer without spending an attempt while another domain
keeps running; a concurrency-1 domain never overlaps across two workers and a flooded domain does not
block another; a group rate limit holds its window; a long per-job lock is not reclaimed while it
heartbeats; and a provider rate-limit signal becomes a group deferral.
