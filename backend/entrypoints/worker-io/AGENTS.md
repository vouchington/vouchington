# IO worker entrypoint

- Never place CPU-only queues here; follow [worker-queue-policy.json](../../modules/worker-queue-inventory/worker-queue-policy.json). Local development uses worker-cpu.
- Exclude `sharp` and `@jongleberry/vurst-ai`; route image processing, native AI detection, and browser crawling to worker-cpu. Preserve no-mistakes lightweight-entrypoint/closure guards.
- Identity tests importing live `Worker` singletons close them before completion: `backend-data-stores` uses `isolate: false`. Follow [live-worker isolation](../../../docs/development/reference-tests-parallel-safety-and-test-root-hygiene.md#live-glidemq-workers-must-not-leak-across-isolatefalse-files).
- Shared execution belongs in [worker-runtime](../../worker-runtime/).
