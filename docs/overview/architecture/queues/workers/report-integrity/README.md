# workers/report-integrity

Source entrypoint: [backend/workers/report-integrity/README.md](../../../../../../backend/workers/report-integrity/README.md)

Worker for the `report_integrity` queue. Processes `processReportIntegrityCheck` jobs enqueued
fire-and-forget by `@services/moderation-reports/integrity` after each new moderation report.

## Job: processReportIntegrityCheck

Calls `detectMassReportCampaign(entityType, entityId)`. If flagged, inserts a
`report_integrity_flags` row and its `report_integrity_flag_reporters` rows via
`createReportIntegrityFlag` (idempotent — deduped by partial unique index). Jobs are debounced per entity (30 s TTL) so rapid report bursts collapse into
one check.

## Backfill and targeted recovery

The periodic dispatcher continues calling `processBackfillReportIntegrity()` without a selector.
An internal caller recovering one known entity may pass `{ entityType, entityId }`. That path
reads only that entity's unresolved reports inside the existing report window, keeps the same
five-distinct-reporter threshold and live-entity predicates, and yields at most one candidate.
It uses the same bulk producer and keeps the existing `{ enqueued }` result with or without a
selector. This is not a REST or queue-payload option.

The processor tests retain threshold and below-threshold fixtures, dispatch only their owned
post during backfill, and read job IDs from the same real bulk-admission promise across queue
states. A callthrough observer matches only the owned post, preserves the original promise,
and drains started admissions before restoring the observer. They do not
scan another test's queue history, shrink the reporter threshold, or clear shared state.
The cases use the selected runner's test budget without per-case timeout overrides, with
five-second user setup and an explicit 30-second native worker-cleanup bound. The canonical
project's shared hook defaults remain separate work.
