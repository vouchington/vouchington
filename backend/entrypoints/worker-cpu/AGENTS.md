# CPU worker entrypoint

- CPU-only queues run here; every worker queue must also be runnable here for local development. Placement is owned by [worker-queue-policy.json](../../modules/worker-queue-inventory/worker-queue-policy.json).
- Shared execution belongs in [worker-runtime](../../worker-runtime/); CPU capabilities include Rust NAPI, Lightpanda, and sharp.
