# Place each responsibility

[Back to Backend Queue Authoring Checklist](backend-queues.md#place-each-responsibility)

- Put queue configuration, payload types, enqueue APIs, and scheduler registration in
  [`backend/queues/<domain>/`](../../backend/queues/). Queue packages must not import workers.
- Put registrations and thin processors in [`backend/workers/<domain>/`](../../backend/workers/).
  Move fetching, validation, authorization, durable writes, and business logic to services.
- Put shared `FlowProducer` instances and `flowProducer.add()` calls in
  [`backend/flows/core/`](../../backend/flows/core/); name enqueue functions with a `Flow` suffix.
- Keep worker placement data-driven in
  [`worker-queue-policy.json`](../../backend/modules/worker-queue-inventory/worker-queue-policy.json). Update its tests
  rather than duplicating CPU/IO lists in code, deployment configuration, scripts, or docs.
