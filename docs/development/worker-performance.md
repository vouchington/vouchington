# Worker Performance

Why worker processes are sized the way they are. Concurrency, thread-pool, and heap values live in
code and the Dockerfile; queue placement lives in
`backend/modules/worker-queue-inventory/worker-queue-policy.json`.

- Every queue runs in exactly one worker process per deployed environment. `worker-cpu` runs the
  native and CPU-bound queues (Rust N-API, sharp, cloud-browser crawling); `worker-io` may run the
  DB, Valkey, and HTTP queues. Local development runs every queue in one process.
- Thread pools stack inside one Node process: libuv, plus a separate Tokio and Rayon pool per
  loaded native addon. Caps are per addon, not per process, so adding an addon multiplies the
  footprint. Retune them together when changing baselines.
- Shared Valkey clients hard-reject at their inflight limit and do not buffer, so a job burst fails
  and retries rather than queueing. Bloom traffic has its own client so its rebuilds cannot starve
  cache and rate-limiter calls.
- Workers that serialize themselves or hit a rate-limited upstream opt out of the global
  concurrency scale.

See [Runtime Timeouts](runtime-timeouts.md) for worker deadlines.
