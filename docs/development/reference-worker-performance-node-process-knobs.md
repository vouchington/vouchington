# Node process knobs

[Back to Worker Performance](worker-performance.md#node-process-knobs)

The `Dockerfile` and `dev/tmux` set per-deployment defaults; override per-environment when
the production task definition wants a different shape:

| Deployment   | `NODE_OPTIONS`                                  | `UV_THREADPOOL_SIZE` | Rust Tokio/Rayon caps |
| ------------ | ----------------------------------------------- | -------------------- | --------------------- |
| `api`        | `--max-old-space-size=384` (≤512 MB task)       | `4`                  | `2`                   |
| `worker-cpu` | `--max-old-space-size=768` (≤1024 MB task)      | `4`                  | `2`                   |
| `worker-io`  | `--max-old-space-size=384` (≤512 MB split task) | `4`                  | `2`                   |

The image defaults cap the worker heaps at 75% of their documented task-memory targets:
`worker-cpu` resolves to `--max-old-space-size=768` and `worker-io` to
`--max-old-space-size=384`. The private `vouchington-infra` repository owns live task sizing. Local
development keeps its separate 3072 MB default.

These are provisional values — retune after first production week.

| Env var              | Effect                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `NODE_OPTIONS`       | Includes `--max-old-space-size=N` to cap the V8 old-generation heap.                     |
| `UV_THREADPOOL_SIZE` | Cap on libuv's worker pool used by N-API async tasks, `fs`, `dns`, `crypto.pbkdf2`, etc. |
| `RUST_TOKIO_*`       | Per-vurst-addon Tokio runtime caps.                                                      |
| `RAYON_NUM_THREADS`  | Per-Rust-cdylib Rayon pool cap.                                                          |
