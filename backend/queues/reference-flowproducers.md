# FlowProducers

[Back to Systems Summary](README.md#flowproducers)

`FlowProducer` orchestrates multi-queue job flows where a parent job depends on children completing first.

- All `FlowProducer` instances live in [`backend/flows/core/queues.mts`](../flows/core/queues.mts) (single shared instance).
- All `flowProducer.add()` calls live in [`backend/flows/core/enqueues.mts`](../flows/core/enqueues.mts).
- Enqueue functions calling `flowProducer.add()` must end with `Flow` (e.g., `enqueuePostAutotaggerFlow`).
- The [`backend/flows/core`](../flows/core/) package has no worker or processor files.
- Every `opts` in the flow job tree — parent AND every child — must include `attempts`.
