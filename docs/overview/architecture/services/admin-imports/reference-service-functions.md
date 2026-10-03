# Service Functions

[Back to Admin Imports Service](README.md#service-functions)

```ts
import {
  parseCsvRows,
  validateTopicRows,
  validateTopicHeaders,
  createImportBatch,
  getImportBatch,
  getImportRowsByBatchId,
  getImportBatchProgress,
} from '@services/admin-imports'
```

- **`parseCsvRows(csvText)`** — Parses CSV string into row objects. Throws on malformed CSV.
- **`validateTopicHeaders(headers)`** — Returns array of unknown column names.
- **`validateTopicRows(rows)`** — Validates all rows; returns `{ valid, rows }` with per-row errors.
- **`createImportBatch(creator, importType, inputRows, metadata?)`** — Inserts batch + rows atomically. Returns `{ batch, rows, rowIds }`.
- **`getImportBatch(batchId)`** — Returns batch or `null`.
- **`getImportRowsByBatchId(batchId)`** — Returns all rows for a batch.
- **`getImportBatchProgress(batchId)`** — Returns `{ total, completed, failed, pending }`.

Administrative CSV imports require an administrator at `importAdminTopics`; the batch retains
the uploader's `created_by_id`, and the worker reloads that user for every processed row. Seed
CSV imports instead use an explicit role-free system actor. Only the internal seed callback
grants that exact actor topic create/update authority; it expires when the callback completes,
including on failure. Seed imports neither grant staff roles nor substitute actors in user imports.
