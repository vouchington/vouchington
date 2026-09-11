# @modules/activitypub-inbox-storage-policy

Defines the single storage policy for durable inbound ActivityPub deliveries. The API, service,
worker, queue schedule, database migrations, tests, and monitoring all consume or mirror these
values so retention and capacity cannot drift between layers.

The policy retains unverified deliveries for one hour and operational failures for seven days. It
caps unverified storage at 10,000 rows or 256 MiB of exact raw request bytes, runs cleanup every
five minutes in bounded batches, and reserves a 30-minute processing lease. Capacity rejections
ask remote senders to retry after five minutes.

These are deployment invariants, not environment overrides. Changing one requires updating the
database constraints and triggers, cleanup behavior, alarms, and contract tests together.

Exact admission accounting deliberately serializes delivery writes through the singleton counter
row. That keeps concurrent cap decisions correct at the bounded scale; any future throughput-driven
redesign must preserve exact admission ordering instead of weakening the counter into an estimate.

## Related

- [Fediverse requirements](../../../docs/requirements/content/FEDIVERSE.md)
- [ActivityPub inbox service](../../services/ap-inbox-activities/README.md)
- [ActivityPub inbox worker](../../workers/activitypub-inbox/README.md)
