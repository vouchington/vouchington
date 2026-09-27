# worker-io

IO-bound workers for deployments that split worker capacity.

Queue placement source: [../../modules/worker-queue-inventory/worker-queue-policy.json](../../modules/worker-queue-inventory/worker-queue-policy.json). CPU-only queues must never be added here. Local development uses worker-cpu instead.

## Rules

- Keep this entrypoint free of CPU-worker-only modules: `sharp` and `@jongleberry/vurst-ai`. Route image processing, native AI detection, and browser crawl work through worker-cpu. The no-mistakes rules `lightweight entrypoints must not reach worker-cpu-only modules` and `worker-io workspace closure excludes worker-cpu-only packages` enforce this (`pnpm run no-mistakes`).
- Definition identity tests that import a live `Worker` singleton must close it. `backend-data-stores` uses `isolate: false`; a leftover consumer deterministically drains later enqueue calls before they return, so `getJobs('waiting')` assertions in later files see nothing waiting. See [parallel-safety](../../../docs/development/reference-tests-parallel-safety-and-test-root-hygiene.md#live-glidemq-workers-must-not-leak-across-isolatefalse-files).

See [../../worker-runtime/](../../worker-runtime/) for the shared worker framework.
