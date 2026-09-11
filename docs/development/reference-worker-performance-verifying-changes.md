# Verifying changes

[Back to Worker Performance](worker-performance.md#verifying-changes)

When changing baselines, scale knobs, or runtime caps, capture before/after for the PR body:

```sh
# Before — record threads and RSS at steady state
node backend/entrypoints/worker-cpu/serve.mts &
PID=$!
sleep 30
ps -M $PID | wc -l
ps -o rss= -p $PID
kill $PID

# After — same shape, same measurements (use worker-io/serve.mts for IO-only queues)
NODE_OPTIONS=--max-old-space-size=768 UV_THREADPOOL_SIZE=4 \
  RUST_TOKIO_WORKER_THREADS=2 \
  RUST_TOKIO_MAX_BLOCKING_THREADS=2 \
  RAYON_NUM_THREADS=2 \
  WORKER_CONCURRENCY_SCALE=1 \
  node backend/entrypoints/worker-cpu/serve.mts &
```
