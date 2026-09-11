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
