# IO worker entrypoint

- Never place CPU-only queues here; follow `modules/worker-queue-inventory/worker-queue-policy.json`.
  Local development uses worker-cpu.
- Queue selection is `WORKER_QUEUE_CLASS` (`io` only) set in `runtime.mts`; never accept `all` or `cpu` here.
