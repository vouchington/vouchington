# workers/report-integrity

Worker for the `report_integrity` queue. Processes `processReportIntegrityCheck` jobs enqueued
fire-and-forget by `@services/moderation-reports/integrity` after each new moderation report.

## Job: processReportIntegrityCheck

Calls `detectMassReportCampaign(entityType, entityId)`. If flagged, inserts a
`report_integrity_flags` row via `createReportIntegrityFlag` (idempotent — deduped by partial
unique index). Jobs are debounced per entity (30 s TTL) so rapid report bursts collapse into
one check.
