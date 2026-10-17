# Glide-MQ Testing

Backend Vitest projects alias `glide-mq` to `test-helpers/glide-mq-vitest-shim.mts`, which builds on glide-mq's own in-memory testing mode (`glide-mq/testing`). Priority, delay, deduplication, retry, flow, and dead-letter behavior are the library's own, so the shim only adds what tests need that production does not:

- **`add`/`addBulk` wait for the job to settle.** Production `add` returns on accept; tests need the worker's side effects. Native `addAndWait` is unsuitable because it rejects `removeOnComplete`/`removeOnFail`, waits on one id, and throws on a deduplicated add. A failed flushed job makes `add` throw.
- **Settlement is event-driven.** `Worker.drain()` closes the worker, and every file in an `isolate: false` fork shares these workers, so the shim waits on terminal events with a bounded watchdog instead.
- **Retries are promoted at once** so a test does not wait out the backoff.
- **Nested enqueue is not flushed.** A processor that enqueues another queue must not keep its parent job active until the child finishes, matching production.
- **Queue close leaves the fork's store and workers alive**, as closing a production producer leaves server state intact. Close workers explicitly and use `obliterate()` to clear jobs.
- **Worker-attachment guard.** A file that leaves an unexpected live worker attached fails; see [Parallel-Safety](../../reference-tests-parallel-safety-and-test-root-hygiene.md#live-glidemq-workers-must-not-leak-across-isolatefalse-files).

Not modeled: production transport ordering, real delay timing, and the `limiter` option (accepted but not applied to the test worker). Assert production queue options directly and use the `backend-real-glide-mq` project or integration tests for transport behavior.

For flows, replayed jobs, or explicit terminal waits use `queue.waitForJobs(jobs, { timeout })`, which waits through delayed and suspended states and rejects failures. Create a `Queue` or `Worker` for every queue a native flow references before adding it.

See the [glide-mq testing docs](https://github.com/avifenesh/glide-mq/blob/main/docs/TESTING.md) for the upstream API.
