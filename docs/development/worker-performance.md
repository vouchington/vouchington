# Worker Performance

How to size and tune the backend job-queue worker processes.

The deployed backend uses one **`worker-cpu`** service for every queue. It runs Rust N-API (HTML
sanitize, markdown render, chunking, AI), sharp (images), Lightpanda cloud browser crawling (a thin
Playwright client over a CDP WebSocket — no local browser process), and the DB/Valkey/HTTP queues
that can also run in `worker-io`. Local development deliberately keeps the
`worker-cpu` and `worker-io` processes split. Each worker has its own queue concurrency knob. Native
addons also have their own thread pools, so this page documents the knobs that shape each process's
resource envelope.

## Contents

- <a id="sizing-target"></a>[Sizing target](reference-worker-performance-sizing-target.md)
- <a id="concurrency-model"></a>[Concurrency model](reference-worker-performance-concurrency-model.md)
- <a id="native-thread-pools"></a>[Native thread pools](reference-worker-performance-native-thread-pools.md)
- <a id="node-process-knobs"></a>[Node process knobs](reference-worker-performance-node-process-knobs.md)
- <a id="profiling"></a>[Profiling](reference-worker-performance-profiling.md)
- <a id="verifying-changes"></a>[Verifying changes](reference-worker-performance-verifying-changes.md)
- <a id="valkey-inflight-saturation-issue-4717"></a>[Valkey Inflight Saturation (issue #4717)](reference-worker-performance-valkey-inflight-saturation-issue-4717.md)
- <a id="related"></a>[Related](reference-worker-performance-related.md)
