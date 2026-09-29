# Validate-Then-Enqueue Pattern

[Back to Admin Imports Service](README.md#validate-then-enqueue-pattern)

All batch endpoints follow this pattern:

1. **Parse** the CSV body into row objects.
2. **Validate headers** against the column allowlist.
3. **Validate rows** synchronously.
4. If any row is invalid, return `422` with per-row errors — no DB writes.
5. If all rows are valid, create the batch + row records in a single transaction.
6. Enqueue one job per row via `enqueueBulkImportRows`.

This ensures the user sees all validation errors upfront, and no partial imports enter the queue.
