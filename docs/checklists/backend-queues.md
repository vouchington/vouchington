# Backend Queue Authoring Checklist

Use this checklist when adding or changing a Voucha GlideMQ queue, worker, processor, flow, job
payload, retry policy, scheduler, backfill, or worker placement. Generic GlideMQ API syntax belongs
in the installed `glide-mq` skill; this page owns Voucha's package, durability, and validation
contracts.

```mermaid
flowchart LR
  P[Producer or flow] -->|durable IDs| Q[Queue]
  Q --> W[Worker and thin processor]
  W --> S[Domain service]
  S --> D[(Durable state)]
  S -->|awaited fan-out| Q
  D -->|cursor scan| B[Scheduler or backfill dispatcher]
  B -->|bounded enqueue| Q
```

## Contents

- <a id="place-each-responsibility"></a>[Place each responsibility](reference-backend-queues-place-each-responsibility.md)
- <a id="define-a-replay-safe-job"></a>[Define a replay-safe job](reference-backend-queues-define-a-replay-safe-job.md)
- <a id="durable-transition-matrix"></a>[Durable transition matrix](reference-backend-queues-durable-transition-matrix.md)
- <a id="schedulers-flows-and-backfills"></a>[Schedulers, flows, and backfills](reference-backend-queues-schedulers-flows-and-backfills.md)
- <a id="test-and-document"></a>[Test and document](reference-backend-queues-test-and-document.md)
- <a id="see-also"></a>[See also](reference-backend-queues-see-also.md)
