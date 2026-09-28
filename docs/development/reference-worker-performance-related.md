# Related

[Back to Worker Performance](worker-performance.md#related)

- [`@modules/queue-config`](../overview/architecture/backend/modules/queue-config/README.md) — concurrency helper.
- [`backend/entrypoints/worker-cpu/AGENTS.md`](../../backend/entrypoints/worker-cpu/AGENTS.md) — CPU-bound worker (Rust NAPI, sharp, Lightpanda).
- [`backend/entrypoints/worker-io/AGENTS.md`](../../backend/entrypoints/worker-io/AGENTS.md) — IO-bound worker (DB, Valkey, HTTP).
- [`backend/queues/README.md`](../overview/architecture/queues/README.md) — Active Workers table with the
  authoritative baseline per worker.
- [https://github.com/jonathanong/vurst](https://github.com/jonathanong/vurst) — Rust workspace and N-API notes.
- [`backend/AGENTS.md`](../../backend/AGENTS.md) — backend reliability patterns.
- [Runtime Timeouts](runtime-timeouts.md) — worker deadlines and `lockDuration` crash-recovery windows (this doc covers throughput/sizing, that one covers timeouts).
