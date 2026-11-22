# IO worker entrypoint

- Load skills: `voucha-queue-authoring`, `glide-mq`, `queue-rules`, `bounded-iteration`.
- Never place CPU-only queues here; follow `modules/worker-queue-inventory/worker-queue-policy.json`.
  Local development uses worker-cpu.
- Queue selection is `WORKER_QUEUE_CLASS` (`io` only) set in `runtime.mts`; never accept `all` or `cpu` here.
