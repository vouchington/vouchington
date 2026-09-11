# Schedulers, flows, and backfills

[Back to Backend Queue Authoring Checklist](backend-queues.md#schedulers-flows-and-backfills)

- Define every scheduled job through `@modules/scheduled-job-manifest`. Include its scheduler ID,
  repeat rule, exact job template, environment gate, and at least one typed operator surface.
  Removing a manifest entry (or gating it `environment: 'production'`) must delete the live GlideMQ
  scheduler; `upsertScheduledJobManifest()` reconciles leftovers after a successful upsert. If the
  last scheduled job for a queue is removed, keep `schedules.mts` with an empty `jobs` array and keep
  its `SCHEDULE_DEFINITIONS` entry so upsert still runs. Do not delete that file. Do not leave
  Valkey orphans and do not call `removeJobScheduler` outside that helper.
- Give central scheduled-job surfaces a normal enqueue API. Domain-specific backfill, PostgreSQL,
  and Valkey controls may remain on their existing admin routes.
- Register every replayable queue in `BACKFILL_REGISTRY`. Stream an exhaustive durable source with a
  PostgreSQL cursor and bulk-enqueue bounded batches; use one throttled dispatcher job at priority
  `100`.
- Exclude irreversible external sends unless a durable marker makes replay safe. Record every
  exclusion and replay contract in
  [`JOB-REPLAYABILITY.md`](../requirements/platform/JOB-REPLAYABILITY.md).
- Put explicit retry options on every flow parent and child, and keep flow execution in the ordinary
  worker packages.
