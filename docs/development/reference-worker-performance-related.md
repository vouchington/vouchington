# Related

[Back to Worker Performance](worker-performance.md#related)

- [`@modules/queue-config`](../../backend/modules/queue-config/README.md) — concurrency helper.
- [`backend/entrypoints/worker-cpu/CLAUDE.md`](../../backend/entrypoints/worker-cpu/CLAUDE.md) — CPU-bound worker (Rust NAPI, sharp, Lightpanda).
- [`backend/entrypoints/worker-io/CLAUDE.md`](../../backend/entrypoints/worker-io/CLAUDE.md) — IO-bound worker (DB, Valkey, HTTP).
- [`backend/queues/README.md`](../../backend/queues/README.md) — Active Workers table with the
  authoritative baseline per worker.
- [https://github.com/jonathanong/vurst](https://github.com/jonathanong/vurst) — Rust workspace and N-API notes.
- [`backend/CLAUDE.md`](../../backend/CLAUDE.md) — backend reliability patterns.
- [Runtime Timeouts](runtime-timeouts.md) — worker deadlines and `lockDuration` crash-recovery windows (this doc covers throughput/sizing, that one covers timeouts).
