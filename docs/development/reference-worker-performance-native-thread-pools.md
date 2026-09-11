# Native thread pools

[Back to Worker Performance](worker-performance.md#native-thread-pools)

Node/libuv, Tokio, and Rayon are separate pools. They stack inside a single Node process.

`UV_THREADPOOL_SIZE` controls Node's libuv worker pool used by N-API async handoff, `fs`, `dns`,
`crypto.pbkdf2`, and similar Node work. Deployment keeps this at `4`.

| Env var              | Effect                                  | Default                             |
| -------------------- | --------------------------------------- | ----------------------------------- |
| `UV_THREADPOOL_SIZE` | Total libuv worker threads per process. | `4` in deployment; `8` in local dev |

The `@jongleberry/vurst-*` N-API packages also own bounded Tokio runtimes. A Rust `static` runtime is
shared only inside one loaded `.node` library; different native addons do not share it. For example,
`vurst-html`, `vurst-ai`, and `vurst-markdown` each get their own Tokio runtime if loaded.

| Env var                           | Effect                                                                     | Deployment default |
| --------------------------------- | -------------------------------------------------------------------------- | ------------------ |
| `RUST_TOKIO_WORKER_THREADS`       | Async scheduler threads per loaded vurst `.node` addon.                    | `2`                |
| `RUST_TOKIO_MAX_BLOCKING_THREADS` | Maximum Tokio `spawn_blocking` threads per loaded vurst `.node` addon.     | `2`                |
| `RAYON_NUM_THREADS`               | Rayon worker threads per loaded Rust cdylib that initializes a Rayon pool. | `2`                |

These values are per native library, not process-wide. If `vurst-html` and `vurst-ai` are both
loaded, each can create up to the configured Tokio/Rayon caps. GlideMQ/Valkey native runtimes and
sharp/libvips have their own thread/process behavior as well. Lightpanda itself runs in the cloud —
`crawl_browser` only holds a Playwright client and a WebSocket connection, so it does not add to
this worker's local thread/process footprint.
