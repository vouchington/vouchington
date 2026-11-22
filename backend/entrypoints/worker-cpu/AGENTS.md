# CPU worker entrypoint

- Load skills: `voucha-queue-authoring`, `glide-mq`, `queue-rules`, `bounded-iteration`.
- CPU-only queues run here, and every worker queue must also be runnable here for local
  development. Placement is owned by `modules/worker-queue-inventory/worker-queue-policy.json`.
- Queue selection is `WORKER_QUEUE_CLASS` (`all` or `cpu`) set in `runtime.mts`; the app, not
  infrastructure, expands it to queue names.
