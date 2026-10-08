---
name: bounded-iteration
description: Bound the rows each Voucha job, sweep, cleanup, or list endpoint reads per run.
---

# Vouchington Bounded Iteration Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-database:bounded-iteration`; if that canonical plugin
source is unavailable or unreadable, read
`node_modules/vouchington-tooling/skills/bounded-iteration/SKILL.md` instead. Grok, Cursor, and
OpenCode read that installed skill path. Resolve supporting resources relative to the selected
canonical skill's directory. Stop if neither canonical source is readable; never apply this adapter
alone.

## Vouchington additions

The canonical skill leaves run caps, tunable names and ceilings, schedules, and enforcement to the
repository. Keep its rules authoritative; do not copy them here.

- **Run cap and tunables.** For batch-deleting cleanup, use `runBoundedBatches()`
  ([source](../../../backend/services/data-retention/run-bounded-batches.mts)): `maxBatches` is
  required and the result reports `hasMore`. Read each batch size and cap from a `DynamicConfig`
  namespace with `getBoundedPositiveIntegerField()` from `@data-stores/valkey`
  ([source](../../../backend/data-stores/valkey/dynamic-config-fields.mts)), giving every field a
  default and a hard maximum. `data-retention-config` is the worked example:
  [config](../../../backend/services/data-retention/config.mts), and its
  [README](../../../docs/overview/architecture/services/data-retention/README.md) owns the values.
- **Namespace registration.** Add the namespace's `defineDynamicConfigNamespace()` entry to a
  `backend/services/dynamic-config-admin/registry-*-entries.mts` file, with each field's `max_value`
  taken from the constant the service reads, and add the namespace to `REGISTRY_ORDER` in
  [`registry-entries.mts`](../../../backend/services/dynamic-config-admin/registry-entries.mts).
  Follow [Adding A Namespace](../../../docs/overview/architecture/services/dynamic-config-admin/README.md#adding-a-namespace).
- **Where sweeps start.** A sweep starts from a scheduled-job manifest,
  `backend/queues/*/enqueues/schedules.mts`, under the
  [scheduler rules](../../../docs/checklists/reference-backend-queues-schedulers-flows-and-backfills.md).
  Each run does at most its cap and the next tick resumes from the persisted position.
- **Streaming helpers.** For `executeHandlerWithCursorInBatches()` and `createAsyncGeneratorFromCursor()`,
  `batchSize` alone bounds memory; supply the runtime-configured per-run `maxRows` cap and use
  `hasMore`/`rowsRead` from [the bounded cursor API](../../../backend/data-stores/psql/bounded-cursor-api.mts)
  to track continuation (`onComplete` exposes the generator result).
- **In-repo example.** Google Play and Microsoft Store source recovery show a cursor table, a sweep
  upper bound fixed when the sweep starts, a compare-and-set advance, and the next scheduled run
  continuing: [`google/recovery-cursor.mts`](../../../backend/services/memberships/google/recovery-cursor.mts),
  [`google/notification-recovery.mts`](../../../backend/services/memberships/google/notification-recovery.mts),
  [`microsoft/source-recovery.mts`](../../../backend/services/memberships/microsoft/source-recovery.mts).
  Follow the current runtime-configured work limits in these examples;
  [#1598](https://github.com/vouchington/vouchington/issues/1598) tracks their cursor table shape.
- **Cursor table shape.** Follow [postgres-schema-design](../postgres-schema-design/SKILL.md) for
  `_cursors` tables; [#1598](https://github.com/vouchington/vouchington/issues/1598) owns reshaping
  the existing ones. Do not restate the shape here.
- **Repair sweeper.** Extend candidate types in [entity-listener reconciliation](../../../backend/services/entity-listener-reconciliation/) for missed post-commit side effects; its overlapping `reconciled_through_at` window re-enqueues missed listener jobs instead of adding another sweeper (see the [replay-safe job checklist](../../../docs/checklists/reference-backend-queues-define-a-replay-safe-job.md)).
- **External listings.** SES inbound reconciliation carries S3's continuation token in a bounded continuation job; see [the queue contract](../../../docs/overview/architecture/queues/ses-inbound/README.md).
- **Bloom-filter failure path.** Follow [API-key Bloom-filter handling](../../../backend/services/api-keys/bloom-filter.mts): a failed `ValkeyBloomFilter` add clears the ready marker so reads fall back to PostgreSQL, then calls `enqueueRebuildBloomFilter` when the marker was removed.
- **UUIDv7 bounds.** Use `getMinUUIDv7ForDate` and `getMinUUIDv7ForParentHistory` from [ids.mts](../../../backend/modules/utils/ids.mts); an age milestone M uses the primary-key range `[min(previousRun - M), min(now - M))`.
