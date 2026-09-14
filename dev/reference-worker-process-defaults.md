# Worker Process Defaults

[Back to Dev Environment Reference](README.md#worker-process-defaults)

`./dev/tmux` starts one `worker-cpu` process with every policy-managed queue from [`backend/modules/worker-queue-inventory/worker-queue-policy.json`](../backend/modules/worker-queue-inventory/worker-queue-policy.json). `crawl_browser` connects to the Lightpanda cloud SaaS (`LIGHTPANDA_CDP_URL`, no local binary or port); set `LIGHTPANDA_TOKEN` (e.g. via `~/voucha.env`) to exercise real crawls locally. Override with env caps:

- `NODE_OPTIONS=--max-old-space-size=3072` — V8 old-generation heap cap (3 GB).
- `UV_THREADPOOL_SIZE=8` — libuv worker pool for Rust N-API `AsyncTask` work and Node I/O.
  These are intentionally larger than the production ECS defaults (worker-cpu: `--max-old-space-size=768`, `UV_THREADPOOL_SIZE=4`; worker-io: `--max-old-space-size=384`, `UV_THREADPOOL_SIZE=4`) because local dev is not memory-constrained like ECS tasks. Override these per-shell to experiment. Worker concurrency itself scales via `WORKER_CONCURRENCY_SCALE`, `WORKER_CONCURRENCY_MAX`, and `WORKER_CONCURRENCY_<NAME>` (defined in [`@modules/queue-config`](../backend/modules/queue-config/README.md)). Full sizing target, profiling steps, and verification commands live in [`../docs/development/worker-performance.md`](../docs/development/worker-performance.md).
