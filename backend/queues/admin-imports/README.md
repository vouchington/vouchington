# Admin Imports System

Processes bulk admin import jobs for topics and CRM contacts via CSV upload.

## Architecture

Each bulk import API call creates an `admin_import_batches` record and individual `admin_import_rows` records, then enqueues one job per row via `enqueueBulkImportRows()`. The processor reads the row, dispatches to the correct processing function based on `batch.import_type`, and updates the row status on completion or failure.

Service-specific row semantics, including CRM contact present-column update behavior, are documented in [Admin Imports Service](../../services/admin-imports/reference-upsert-semantics.md#crm-contacts).

## Queue Reference

| Queue           | Processor          | Group Keys | Default Priority | Description                       |
| --------------- | ------------------ | ---------- | ---------------- | --------------------------------- |
| `admin-imports` | `processImportRow` | none       | 10               | Process a single admin import row |

Intermediate errors remain retryable; the first final success/failure is database-guarded on
`admin_import_rows`, and batch completion must match terminal row counters — see
[JOB-REPLAYABILITY.md](../../../docs/requirements/platform/JOB-REPLAYABILITY.md).

This staff-only queue intentionally has no automatic backfill. Loss after a Valkey reset is an
accepted-loss contract: an administrator restarts the import from its persisted batch and row
records. This exclusion must remain explicit in the replayability matrix.

## Related

- Service: [backend/services/admin-imports/README.md](../../services/admin-imports/README.md)
- API: [backend/api/v1/admin/imports/README.md](../../api/v1/admin/imports/README.md)
- Parent: [backend/queues/CLAUDE.md](../CLAUDE.md)
